/**
 * @jest-environment node
 *
 * Unit tests for the admin login throttle with Prisma mocked by an in-memory
 * table that applies the same WHERE semantics as the SQL Prisma emits
 * (see throttle.integration.test.ts for the real-database and concurrency
 * tests).
 */

import { createHash, createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    adminLoginBucket: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { ADMIN_LOGIN_THROTTLE, consumeAttempt } from "@/lib/admin-login/throttle";

type Row = { key: string; windowStart: Date; count: number };
type UpdateManyArgs = {
  where: { key: string; windowStart: { gt?: Date; lte?: Date }; count?: { lt: number } };
  data: { count: number | { increment: number }; windowStart?: Date };
};
type FindUniqueArgs = { where: { key: string } };
type CreateArgs = { data: Row };
type DeleteManyArgs = { where: { windowStart: { lt: Date } } };

const db = prisma.adminLoginBucket as unknown as {
  updateMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  deleteMany: jest.Mock;
};

const SECRET = "unit-test-auth-secret";
const OTHER_SECRET = "another-unit-test-secret";
const EMAIL = "admin@example.com";
const IP = "203.0.113.7";
const NOW = new Date("2026-01-01T00:10:00.000Z");
const MIN = 60 * 1000;
const WINDOW_MS = 15 * MIN;

/** The in-memory admin_login_buckets table. */
const table = new Map<string, Row>();

function hmac(secret: string, input: string): string {
  return createHmac("sha256", secret).update(`admin-login:${input}`).digest("hex");
}

const keys = (secret = SECRET, email = EMAIL, ip = IP) => ({
  ip: hmac(secret, `ip:${ip}`),
  pair: hmac(secret, `pair:${email}\n${ip}`),
  email: hmac(secret, `email:${email}`),
});

function at(msFromNow: number): Date {
  return new Date(NOW.getTime() + msFromNow);
}

function seed(key: string, windowStart: Date, count: number) {
  table.set(key, { key, windowStart, count });
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`key`)", {
    code: "P2002",
    clientVersion: "test",
  });
}

// Same predicates as the SQL in the integration test's query log.
async function fakeUpdateMany({ where, data }: UpdateManyArgs): Promise<{ count: number }> {
  const row = table.get(where.key);
  if (!row) return { count: 0 };
  if (where.windowStart.gt !== undefined && !(row.windowStart > where.windowStart.gt)) return { count: 0 };
  if (where.windowStart.lte !== undefined && !(row.windowStart <= where.windowStart.lte)) return { count: 0 };
  if (where.count !== undefined && !(row.count < where.count.lt)) return { count: 0 };
  row.count = typeof data.count === "number" ? data.count : row.count + data.count.increment;
  if (data.windowStart !== undefined) row.windowStart = data.windowStart;
  return { count: 1 };
}

async function fakeFindUnique({ where }: FindUniqueArgs): Promise<Row | null> {
  const row = table.get(where.key);
  return row ? { ...row } : null;
}

async function fakeCreate({ data }: CreateArgs): Promise<Row> {
  if (table.has(data.key)) throw uniqueViolation();
  table.set(data.key, { ...data });
  return { ...data };
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
function callLog(): Array<[string, { where?: { key?: string }; data?: { key?: string } }]> {
  const entries = (Object.keys(db) as Array<keyof typeof db>).flatMap((method) =>
    db[method].mock.calls.map((call, i) => ({
      order: db[method].mock.invocationCallOrder[i],
      entry: [method, call[0]] as [string, { where?: { key?: string }; data?: { key?: string } }],
    }))
  );
  return entries.sort((a, b) => a.order - b.order).map((e) => e.entry);
}

/** Bucket keys touched by decision statements, in order, consecutive repeats collapsed. */
function touchedKeys(): string[] {
  const touched = callLog()
    .filter(([method]) => method !== "deleteMany")
    .map(([, args]) => args.where?.key ?? args.data?.key ?? "?");
  return touched.filter((key, i) => key !== touched[i - 1]);
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
  db.updateMany.mockImplementation(fakeUpdateMany);
  db.findUnique.mockImplementation(fakeFindUnique);
  db.create.mockImplementation(fakeCreate);
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
  it("uses a fixed 15-minute window: 20 per IP, 5 per email+IP pair, 50 per email", () => {
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
  it("are HMAC-SHA256 of the scoped, normalized inputs; no email or IP reaches Prisma", async () => {
    await consumeAttempt({ email: "  Admin@Example.COM ", ip: IP, now: NOW });

    const k = keys();
    expect([...table.keys()].sort()).toEqual([k.ip, k.pair, k.email].sort());
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
    const second = [...table.keys()];
    expect(second.filter((key) => first.includes(key))).toEqual([]);
  });

  it("separates the IP, pair and email scopes", async () => {
    // the same string as email and IP must not collide across scopes
    await consumeAttempt({ email: IP, ip: IP, now: NOW });
    expect(table.size).toBe(3);
  });

  it("prefers AUTH_SECRET and falls back to NEXTAUTH_SECRET, like next-auth", async () => {
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect([...table.keys()]).toEqual([keys(SECRET).email]);

    table.clear();
    delete process.env.AUTH_SECRET;
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect([...table.keys()]).toEqual([keys(OTHER_SECRET).email]);
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

describe("bucket order", () => {
  it("consumes ip, then pair, then email", async () => {
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({ allowed: true });
    const k = keys();
    expect(touchedKeys()).toEqual([k.ip, k.pair, k.email]);
    expect([...table.values()].map((row) => row.count)).toEqual([1, 1, 1]);
  });

  it.each([
    ["null", null],
    ["empty", ""],
  ])("uses only the email bucket when the IP is %s", async (_label, ip) => {
    await expect(consumeAttempt({ email: EMAIL, ip, now: NOW })).resolves.toEqual({ allowed: true });
    expect(touchedKeys()).toEqual([keys().email]);
    expect(table.get(keys().email)).toEqual({ key: keys().email, windowStart: NOW, count: 1 });
  });

  it("stops at a full IP bucket: pair and email are not touched", async () => {
    const k = keys();
    seed(k.ip, at(-10 * MIN), 20);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
    expect(touchedKeys()).toEqual([k.ip]);
    expect(table.get(k.ip)?.count).toBe(20);
    expect(table.has(k.pair)).toBe(false);
    expect(table.has(k.email)).toBe(false);
  });

  it("stops at a full pair bucket: the IP slot stays used, email is not touched", async () => {
    const k = keys();
    seed(k.ip, at(-MIN), 3);
    seed(k.pair, at(-12 * MIN), 5);
    seed(k.email, at(-MIN), 7);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3 * 60,
    });
    expect(touchedKeys()).toEqual([k.ip, k.pair]);
    expect(table.get(k.ip)?.count).toBe(4);
    expect(table.get(k.pair)?.count).toBe(5);
    expect(table.get(k.email)?.count).toBe(7);
  });

  it("denies at a full email bucket: the IP and pair slots stay used", async () => {
    const k = keys();
    seed(k.email, at(-8 * MIN), 50);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 7 * 60,
    });
    expect(touchedKeys()).toEqual([k.ip, k.pair, k.email]);
    expect(table.get(k.ip)?.count).toBe(1);
    expect(table.get(k.pair)?.count).toBe(1);
    expect(table.get(k.email)?.count).toBe(50);
  });

  it("denies at a full email bucket when the IP is null", async () => {
    seed(keys().email, at(-8 * MIN), 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 7 * 60,
    });
  });

  it("allows up to each limit exactly", async () => {
    const k = keys();
    seed(k.ip, at(-MIN), 19);
    seed(k.pair, at(-MIN), 4);
    seed(k.email, at(-MIN), 49);

    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({ allowed: true });
    expect([table.get(k.ip)?.count, table.get(k.pair)?.count, table.get(k.email)?.count]).toEqual([
      20, 5, 50,
    ]);
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toMatchObject({
      allowed: false,
    });
  });
});

describe("one bucket: statements", () => {
  const cutoff = at(-WINDOW_MS);

  it("in the window and below the limit: one conditional increment, nothing else", async () => {
    const key = keys().email;
    seed(key, at(-MIN), 3);

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.updateMany.mock.calls).toEqual([
      [
        {
          where: { key, windowStart: { gt: cutoff }, count: { lt: 50 } },
          data: { count: { increment: 1 } },
        },
      ],
    ]);
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(table.get(key)).toEqual({ key, windowStart: at(-MIN), count: 4 });
  });

  it("window over: a conditional reset starts a new window with this attempt", async () => {
    const key = keys().email;
    seed(key, at(-20 * MIN), 50);

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.updateMany.mock.calls[1]).toEqual([
      { where: { key, windowStart: { lte: cutoff } }, data: { count: 1, windowStart: NOW } },
    ]);
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(table.get(key)).toEqual({ key, windowStart: NOW, count: 1 });
  });

  it("no bucket yet: creates it with this attempt", async () => {
    const key = keys().email;
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(db.findUnique).toHaveBeenCalledWith({ where: { key } });
    expect(db.create).toHaveBeenCalledWith({ data: { key, windowStart: NOW, count: 1 } });
  });

  it("full: two failed updates and one read, no write", async () => {
    const key = keys().email;
    seed(key, at(-MIN), 50);

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 14 * 60,
    });
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(db.findUnique).toHaveBeenCalledTimes(1);
    expect(db.create).not.toHaveBeenCalled();
    expect(table.get(key)?.count).toBe(50);
  });

  it("treats a window that started exactly windowMs ago as over", async () => {
    const key = keys().email;
    seed(key, at(-WINDOW_MS), 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(table.get(key)).toEqual({ key, windowStart: NOW, count: 1 });
  });

  it("treats a window that started 1 ms later than that as still running", async () => {
    seed(keys().email, at(-WINDOW_MS + 1), 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("uses the current time when now is omitted", async () => {
    await consumeAttempt({ email: EMAIL, ip: null });
    expect(table.get(keys().email)?.windowStart).toEqual(NOW);
  });
});

describe("retryAfterSeconds", () => {
  it.each([
    ["the rest of the window", at(-10 * MIN), 5 * 60],
    ["rounded up to whole seconds", at(-10 * MIN + 500), 5 * 60 + 1],
    ["at least 1", at(-WINDOW_MS + 1), 1],
    ["a full window when it just started", NOW, 15 * 60],
  ])("is %s", async (_label, windowStart, expected) => {
    seed(keys().email, windowStart, 50);
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expected,
    });
  });

  it("comes from the bucket that denied", async () => {
    const k = keys();
    seed(k.pair, at(-14 * MIN), 5); // +1m
    seed(k.email, at(-2 * MIN), 50); // would be +13m, never reached
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });
});

describe("races between the steps", () => {
  it("retries when a concurrent request created the bucket first (P2002)", async () => {
    const key = keys().email;
    db.create.mockImplementationOnce(async () => {
      seed(key, NOW, 1); // the other request's row
      throw uniqueViolation();
    });

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.updateMany).toHaveBeenCalledTimes(3); // round 1: two misses; round 2: the increment
    expect(table.get(key)?.count).toBe(2);
  });

  it("denies when the bucket a concurrent request created is already full", async () => {
    const key = keys().email;
    db.create.mockImplementationOnce(async () => {
      seed(key, at(-MIN), 50);
      throw uniqueViolation();
    });
    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 14 * 60,
    });
  });

  it("retries when the bucket was reset below the limit between the steps", async () => {
    const key = keys().email;
    seed(key, at(-20 * MIN), 50); // expired
    // A concurrent request resets the window after this one's first update.
    db.updateMany
      .mockImplementationOnce(async (args: UpdateManyArgs) => {
        const result = await fakeUpdateMany(args);
        seed(key, at(-1), 1);
        return result;
      });

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.findUnique).toHaveBeenCalledTimes(1); // saw count 1 < limit: not a denial
    expect(table.get(key)?.count).toBe(2);
  });

  it("retries when the bucket read in step 3 has an expired window", async () => {
    const key = keys().email;
    db.findUnique.mockImplementationOnce(async () => ({ key, windowStart: at(-20 * MIN), count: 50 }));
    seed(key, at(-MIN), 2);
    db.updateMany
      .mockImplementationOnce(async () => ({ count: 0 }))
      .mockImplementationOnce(async () => ({ count: 0 }));

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({ allowed: true });
    expect(db.create).not.toHaveBeenCalled();
    expect(table.get(key)?.count).toBe(3);
  });

  it("denies (fail-closed, retry after a full window) after 3 rounds without a decision", async () => {
    const key = keys().email;
    db.create.mockImplementation(async () => {
      throw uniqueViolation(); // the row vanishes again before every next read
    });

    await expect(consumeAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
    expect(db.create).toHaveBeenCalledTimes(3);
    expect(db.findUnique).toHaveBeenCalledTimes(3);
    expect(db.updateMany).toHaveBeenCalledTimes(6);
    expect(db.updateMany.mock.calls.every(([args]) => args.where.key === key)).toBe(true);
  });

  it("stops at the bucket whose rounds ran out: later buckets are not touched", async () => {
    const k = keys();
    db.create.mockImplementation(async (args: CreateArgs) => {
      if (args.data.key === k.pair) throw uniqueViolation();
      return fakeCreate(args);
    });
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
    expect(touchedKeys()).toEqual([k.ip, k.pair]);
  });
});

describe("pruning expired buckets", () => {
  it.each([
    ["allowed", () => undefined],
    ["denied at the IP bucket", () => seed(keys().ip, at(-MIN), 20)],
    ["denied at the pair bucket", () => seed(keys().pair, at(-MIN), 5)],
    ["denied at the email bucket", () => seed(keys().email, at(-MIN), 50)],
  ])("runs exactly once, as the last statement, with the window cutoff (%s)", async (_label, arrange) => {
    arrange();
    await consumeAttempt({ email: EMAIL, ip: IP, now: NOW });

    expect(db.deleteMany.mock.calls).toEqual([[{ where: { windowStart: { lt: at(-WINDOW_MS) } } }]]);
    const log = callLog();
    expect(log[log.length - 1][0]).toBe("deleteMany");
  });

  it("deletes buckets whose window is over and keeps running ones", async () => {
    seed("old", at(-WINDOW_MS - 1), 3);
    seed("edge", at(-WINDOW_MS), 3);
    seed("running", at(-WINDOW_MS + 1), 3);
    await consumeAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(table.has("old")).toBe(false);
    expect(table.has("edge")).toBe(true); // `lt`: removed by the next call, harmless either way
    expect(table.has("running")).toBe(true);
  });

  it.each([
    ["allowed", () => undefined, { allowed: true }],
    [
      "denied",
      () => seed(keys().pair, at(-10 * MIN), 5),
      { allowed: false, retryAfterSeconds: 5 * 60 },
    ],
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

  it("when the increment fails", async () => {
    db.updateMany.mockRejectedValueOnce(boom);
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when the reset fails", async () => {
    db.updateMany.mockImplementationOnce(fakeUpdateMany).mockRejectedValueOnce(boom);
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when the read fails", async () => {
    db.findUnique.mockRejectedValueOnce(boom);
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when the create fails with anything but a unique violation", async () => {
    db.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
        code: "P2003",
        clientVersion: "test",
      })
    );
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toMatchObject({
      code: "P2003",
    });
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it("in a later bucket, after earlier buckets were consumed", async () => {
    const k = keys();
    db.updateMany.mockImplementation(async (args: UpdateManyArgs) => {
      if (args.where.key === k.email) throw boom;
      return fakeUpdateMany(args);
    });
    await expect(consumeAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});
