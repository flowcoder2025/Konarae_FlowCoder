/**
 * @jest-environment node
 *
 * Unit tests for the admin login throttle with Prisma mocked by an in-memory
 * table that applies the same upsert semantics as the SQL Prisma emits
 * (INSERT ... ON CONFLICT ("key") DO UPDATE SET count = count + 1 RETURNING;
 * see throttle.integration.test.ts for the real-database tests).
 */

import { createHash, createHmac } from "node:crypto";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    adminLoginBucket: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { ADMIN_LOGIN_THROTTLE, consumeAttempt } from "@/lib/admin-login/throttle";

type Row = { key: string; windowStart: Date; count: number };
type UpsertArgs = {
  where: { key: string };
  create: Row;
  update: { count: { increment: number } };
  select: { count: true };
};
type DeleteManyArgs = { where: { windowStart: { lt: Date } } };

const db = prisma.adminLoginBucket as unknown as {
  upsert: jest.Mock;
  deleteMany: jest.Mock;
};

const SECRET = "unit-test-auth-secret";
const OTHER_SECRET = "another-unit-test-secret";
const EMAIL = "admin@example.com";
const IP = "203.0.113.7";
const MIN = 60 * 1000;
const WINDOW_MS = 15 * MIN;
// 2026-01-01T00:00:00Z is a window boundary (epoch windows of 15 minutes).
const WINDOW = Date.UTC(2026, 0, 1) / WINDOW_MS;
const WINDOW_START = new Date(WINDOW * WINDOW_MS);
const NOW = new Date(WINDOW_START.getTime() + 5 * MIN);

/** The in-memory admin_login_buckets table. */
const table = new Map<string, Row>();

function hmac(secret: string, input: string): string {
  return createHmac("sha256", secret).update(`admin-login:${input}`).digest("hex");
}

const keys = (window = WINDOW, secret = SECRET, email = EMAIL, ip = IP) => ({
  ip: hmac(secret, `ip:${ip}\n${window}`),
  pair: hmac(secret, `pair:${email}\n${ip}\n${window}`),
  email: hmac(secret, `email:${email}\n${window}`),
});

function seed(key: string, count: number, windowStart = WINDOW_START) {
  table.set(key, { key, windowStart, count });
}

async function fakeUpsert({ where, create, update }: UpsertArgs): Promise<{ count: number }> {
  const row = table.get(where.key);
  if (row) {
    row.count += update.count.increment;
    return { count: row.count };
  }
  table.set(create.key, { ...create });
  return { count: create.count };
}

async function fakeDeleteMany({ where }: DeleteManyArgs): Promise<{ count: number }> {
  let count = 0;
  for (const [key, row] of table) {
    if (row.windowStart < where.windowStart.lt) {
      table.delete(key);
      count++;
    }
  }
  return { count };
}

/** Every Prisma call in invocation order, as [method, args]. */
function callLog(): Array<[string, UpsertArgs | DeleteManyArgs]> {
  const entries = (Object.keys(db) as Array<keyof typeof db>).flatMap((method) =>
    db[method].mock.calls.map((call, i) => ({
      order: db[method].mock.invocationCallOrder[i],
      entry: [method, call[0]] as [string, UpsertArgs | DeleteManyArgs],
    }))
  );
  return entries.sort((a, b) => a.order - b.order).map((e) => e.entry);
}

/** Bucket keys upserted, in order. */
function upsertedKeys(): string[] {
  return db.upsert.mock.calls.map(([args]) => (args as UpsertArgs).where.key);
}

let consoleSpies: jest.SpyInstance[];
function loggedText(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => args.map((arg: unknown) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "))
    .join("\n");
}

const savedEnv = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  process.env.AUTH_SECRET = SECRET;
  process.env.NEXTAUTH_SECRET = OTHER_SECRET;
  table.clear();
  db.upsert.mockImplementation(fakeUpsert);
  db.deleteMany.mockImplementation(fakeDeleteMany);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined)
  );
});

afterEach(() => {
  jest.useRealTimers();
  consoleSpies.forEach((spy) => spy.mockRestore());
});

afterAll(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("limits", () => {
  it("uses fixed 15-minute windows: 20 per IP, 5 per email+IP pair, 50 per email", () => {
    expect(ADMIN_LOGIN_THROTTLE).toEqual({
      windowMs: 900_000,
      ipLimit: 20,
      pairLimit: 5,
      emailLimit: 50,
    });
    expect(Object.isFrozen(ADMIN_LOGIN_THROTTLE)).toBe(true);
  });
});

describe("bucket keys", () => {
  it("are HMAC-SHA256 of the scoped, normalized inputs and the window index; no email or IP reaches Prisma", async () => {
    await consumeAttempt({ email: "  Admin@Example.COM ", ip: IP, now: NOW });

    const k = keys();
    expect(upsertedKeys()).toEqual([k.ip, k.pair, k.email]);
    for (const key of table.keys()) expect(key).toMatch(/^[0-9a-f]{64}$/);

    const sent = JSON.stringify(callLog()).toLowerCase();
    expect(sent).not.toContain("admin@example.com");
    expect(sent).not.toContain("example");
    expect(sent).not.toContain(IP);
  });

  it("are not plain hashes and depend on the secret", async () => {
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });
    const first = [...table.keys()];
    expect(first).not.toContain(createHash("sha256").update(EMAIL).digest("hex"));
    expect(first).not.toContain(createHash("sha256").update(IP).digest("hex"));

    table.clear();
    process.env.AUTH_SECRET = "a-different-secret";
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });
    expect([...table.keys()].filter((key) => first.includes(key))).toEqual([]);
  });

  it("change with the window", async () => {
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });
    await consumeAttempt({ email: EMAIL, ip: IP, now: new Date(NOW.getTime() + WINDOW_MS) });
    const [first, second] = [keys(WINDOW), keys(WINDOW + 1)];
    expect(upsertedKeys()).toEqual([first.ip, first.pair, first.email, second.ip, second.pair, second.email]);
  });

  it("separates the IP, pair and email scopes", async () => {
    // the same string as email and IP must not collide across scopes
    await consumeAttempt({ email: IP, ip: IP, now: NOW });
    expect(table.size).toBe(3);
  });

  it("prefers AUTH_SECRET and falls back to NEXTAUTH_SECRET, like next-auth", async () => {
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(upsertedKeys()).toEqual([keys(WINDOW, SECRET).email]);

    delete process.env.AUTH_SECRET;
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(upsertedKeys()[1]).toBe(keys(WINDOW, OTHER_SECRET).email);
  });

  it.each([
    ["both unset", undefined, undefined],
    ["AUTH_SECRET empty, NEXTAUTH_SECRET unset", "", undefined],
    ["AUTH_SECRET unset, NEXTAUTH_SECRET empty", undefined, ""],
  ])("throws before touching the DB when the secret is missing (%s)", async (_label, auth, nextauth) => {
    if (auth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = auth;
    if (nextauth === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = nextauth;

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toThrow(/secret/i);
    expect(callLog()).toEqual([]);
  });
});

describe("one statement per bucket", () => {
  it("upserts each bucket once: insert with count 1, or increment, returning the count", async () => {
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });

    const key = keys().email;
    const expected = {
      where: { key },
      create: { key, windowStart: WINDOW_START, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    };
    // the same single call for a missing and an existing bucket
    expect(db.upsert.mock.calls).toEqual([[expected], [expected]]);
    expect(table.get(key)?.count).toBe(2);
  });

  it("uses only upsert for decisions (no read, reset or create path)", async () => {
    seed(keys().pair, 5);
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });
    expect(callLog().map(([method]) => method)).toEqual(["upsert", "upsert", "deleteMany"]);
  });

  it("uses the current time when now is omitted", async () => {
    await consumeAttempt({ email: EMAIL, ip: null });
    expect(table.get(keys().email)?.windowStart).toEqual(WINDOW_START);
  });
});

describe("bucket order", () => {
  it("consumes ip, then pair, then email", async () => {
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({ allowed: true });
    const k = keys();
    expect(upsertedKeys()).toEqual([k.ip, k.pair, k.email]);
    expect([...table.values()].map((row) => row.count)).toEqual([1, 1, 1]);
  });

  it.each([
    ["null", null],
    ["empty", ""],
  ])("uses only the email bucket when the IP is %s", async (_label, ip) => {
    await expect(consumeAttempt({ email: EMAIL, ip, now: NOW })).resolves.toEqual({ allowed: true });
    expect(upsertedKeys()).toEqual([keys().email]);
  });

  it("stops at a full IP bucket (its counter still goes up): pair and email are not touched", async () => {
    const k = keys();
    seed(k.ip, 20);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
    expect(upsertedKeys()).toEqual([k.ip]);
    expect(table.get(k.ip)?.count).toBe(21);
    expect(table.has(k.pair)).toBe(false);
    expect(table.has(k.email)).toBe(false);
  });

  it("stops at a full pair bucket: the IP slot stays used, email is not touched", async () => {
    const k = keys();
    seed(k.ip, 3);
    seed(k.pair, 5);
    seed(k.email, 7);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
    expect(upsertedKeys()).toEqual([k.ip, k.pair]);
    expect([table.get(k.ip)?.count, table.get(k.pair)?.count, table.get(k.email)?.count]).toEqual([4, 6, 7]);
  });

  it("denies at a full email bucket: the IP and pair slots stay used", async () => {
    const k = keys();
    seed(k.email, 50);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
    expect(upsertedKeys()).toEqual([k.ip, k.pair, k.email]);
    expect([table.get(k.ip)?.count, table.get(k.pair)?.count, table.get(k.email)?.count]).toEqual([1, 1, 51]);
  });

  it("denies at a full email bucket when the IP is null", async () => {
    seed(keys().email, 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
  });

  it("allows while the returned count is at most the limit", async () => {
    const k = keys();
    seed(k.ip, 19);
    seed(k.pair, 4);
    seed(k.email, 49);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({ allowed: true });
    expect([table.get(k.ip)?.count, table.get(k.pair)?.count, table.get(k.email)?.count]).toEqual([20, 5, 50]);
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toMatchObject({
      allowed: false,
    });
  });
});

describe("fixed epoch windows", () => {
  const lastMs = new Date(WINDOW_START.getTime() + WINDOW_MS - 1);
  const nextStart = new Date(WINDOW_START.getTime() + WINDOW_MS);

  it("stores the window start, floor(now / windowMs) * windowMs", async () => {
    await consumeAttempt({ email: EMAIL, ip: null, now: lastMs });
    expect(table.get(keys(WINDOW).email)?.windowStart).toEqual(WINDOW_START);
    await consumeAttempt({ email: EMAIL, ip: null, now: nextStart });
    expect(table.get(keys(WINDOW + 1).email)?.windowStart).toEqual(nextStart);
  });

  it("denies in the last millisecond of a full window and allows in the first of the next", async () => {
    seed(keys(WINDOW).email, 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: lastMs })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: nextStart })).resolves.toEqual({
      allowed: true,
    });
    expect(table.get(keys(WINDOW + 1).email)?.count).toBe(1);
  });

  it.each([
    ["the rest of the window", NOW, 10 * 60],
    ["rounded up to whole seconds", new Date(NOW.getTime() + 500), 10 * 60],
    ["rounded up from just past a second", new Date(NOW.getTime() + 1001), 10 * 60 - 1],
    ["at least 1", lastMs, 1],
    ["a full window at its first millisecond", WINDOW_START, 15 * 60],
  ])("retryAfterSeconds is %s", async (_label, now, expected) => {
    seed(keys(WINDOW).email, 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expected,
    });
  });
});

describe("pruning old windows", () => {
  const previousStart = new Date(WINDOW_START.getTime() - WINDOW_MS);

  it.each([
    ["allowed", () => undefined],
    ["denied at the IP bucket", () => seed(keys().ip, 20)],
    ["denied at the pair bucket", () => seed(keys().pair, 5)],
    ["denied at the email bucket", () => seed(keys().email, 50)],
  ])("runs exactly once, as the last statement (%s)", async (_label, arrange) => {
    arrange();
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });

    expect(db.deleteMany.mock.calls).toEqual([[{ where: { windowStart: { lt: previousStart } } }]]);
    const log = callLog();
    expect(log[log.length - 1][0]).toBe("deleteMany");
  });

  it("keeps the current and the previous window, deletes older ones", async () => {
    // The previous window stays so that a request whose clock is just behind
    // the boundary still counts on its window's row instead of recreating it.
    seed("two-back", 3, new Date(WINDOW_START.getTime() - 2 * WINDOW_MS));
    seed("previous", 3, previousStart);
    seed("current", 3, WINDOW_START);
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(table.has("two-back")).toBe(false);
    expect(table.has("previous")).toBe(true);
    expect(table.has("current")).toBe(true);
  });

  it.each([
    ["allowed", () => undefined, { allowed: true }],
    ["denied", () => seed(keys().pair, 5), { allowed: false, retryAfterSeconds: 10 * 60 }],
  ])("swallows and logs a prune error without email or IP (%s)", async (_label, arrange, expected) => {
    arrange();
    db.deleteMany.mockRejectedValue(new Error(`prune failed for ${EMAIL} from ${IP}`));

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual(expected);

    const logs = loggedText();
    expect(logs).toMatch(/prune/i);
    expect(logs).not.toContain(EMAIL);
    expect(logs).not.toContain(IP);
  });
});

describe("decision errors propagate (the caller denies: fail-closed)", () => {
  const boom = new Error("db down");

  it.each([
    ["ip", 0],
    ["pair", 1],
    ["email", 2],
  ])("when the %s upsert fails, with no prune after it", async (_label, failingCall) => {
    let calls = 0;
    db.upsert.mockImplementation(async (args: UpsertArgs) => {
      if (calls++ === failingCall) throw boom;
      return fakeUpsert(args);
    });
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.upsert).toHaveBeenCalledTimes(failingCall + 1);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});
