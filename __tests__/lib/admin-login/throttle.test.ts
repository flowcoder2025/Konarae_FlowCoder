/**
 * @jest-environment node
 */

import { createHash, createHmac } from "node:crypto";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    adminLoginAttempt: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  ADMIN_LOGIN_THROTTLE,
  markAttemptSucceeded,
  registerAttempt,
} from "@/lib/admin-login/throttle";

type Row = { id: string; createdAt: Date };
type Where = {
  keyHash?: string;
  ipHash?: string | null;
  success: boolean;
  blocked: boolean;
  createdAt: { gt: Date };
};
type FindManyArgs = { where: Where; orderBy: unknown; take: number; select: unknown };
type BucketName = "pair" | "ip" | "email";
/**
 * Real failures of OTHER attempts in a bucket, newest first. A plain array is
 * the same before and after this attempt's insert; `{ before, after }` models
 * concurrent rows landing between the pre-check and the count.
 */
type BucketSpec = Date[] | { before: Date[]; after: Date[] };

const db = prisma.adminLoginAttempt as unknown as {
  create: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  deleteMany: jest.Mock;
};

const SECRET = "unit-test-auth-secret";
const OTHER_SECRET = "another-unit-test-secret";
const EMAIL = "admin@example.com";
const IP = "203.0.113.7";
const NOW = new Date("2026-01-01T00:10:00.000Z");
const MIN = 60 * 1000;
const OWN_ID = "attempt-own";

function hmac(secret: string, kind: "email" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`admin-login:${kind}:${value}`).digest("hex");
}

function at(msFromNow: number): Date {
  return new Date(NOW.getTime() + msFromNow);
}

function repeat(date: Date, n: number): Date[] {
  return Array.from({ length: n }, () => date);
}

function bucketOf(where: Where): BucketName {
  const hasKey = "keyHash" in where;
  const hasIp = "ipHash" in where;
  if (hasKey && hasIp) return "pair";
  if (hasIp) return "ip";
  return "email";
}

/** Whether this attempt's own row is in the table as a pending (non-blocked) failure. */
let ownPending = false;

/** Serve findMany like the DB would: other rows, plus the own row once pending. */
function serveFailures(byBucket: Partial<Record<BucketName, BucketSpec>>) {
  db.findMany.mockImplementation(async (args: FindManyArgs) => {
    const spec = byBucket[bucketOf(args.where)] ?? [];
    const dates = Array.isArray(spec) ? spec : ownPending ? spec.after : spec.before;
    const rows: Row[] = dates.map((createdAt, i) => ({ id: `other-${i}`, createdAt }));
    if (ownPending) rows.push({ id: OWN_ID, createdAt: NOW });
    // newest first; stable, so the own row sorts after others with the same time
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(0, args.take);
  });
}

function findManyCalls(): FindManyArgs[] {
  return db.findMany.mock.calls.map(([args]) => args as FindManyArgs);
}

const savedEnv = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

function restoreEnv(name: keyof typeof savedEnv) {
  if (savedEnv[name] === undefined) delete process.env[name];
  else process.env[name] = savedEnv[name];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  process.env.AUTH_SECRET = SECRET;
  process.env.NEXTAUTH_SECRET = OTHER_SECRET;
  ownPending = false;
  db.create.mockImplementation(async (args: { data: { blocked: boolean } }) => {
    ownPending = !args.data.blocked;
    return { id: OWN_ID };
  });
  db.update.mockImplementation(async (args: { data: { blocked?: boolean } }) => {
    if (args.data.blocked) ownPending = false;
    return {};
  });
  db.deleteMany.mockResolvedValue({ count: 0 });
  serveFailures({});
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  restoreEnv("AUTH_SECRET");
  restoreEnv("NEXTAUTH_SECRET");
});

describe("limits", () => {
  it("uses a 15-minute window: 5 per email+IP pair, 20 per IP, 50 per email", () => {
    expect(ADMIN_LOGIN_THROTTLE).toEqual({
      windowMs: 15 * MIN,
      pairLimit: 5,
      ipLimit: 20,
      emailLimit: 50,
      retentionMs: 24 * 60 * MIN,
    });
  });
});

describe("key hashing", () => {
  it("stores HMAC-SHA256 keys of the normalized email and the IP, never the raw values", async () => {
    await registerAttempt({ email: "  Admin@Example.COM ", ip: IP, now: NOW });

    expect(db.create).toHaveBeenCalledTimes(1);
    const { data } = db.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(["blocked", "createdAt", "ipHash", "keyHash", "success"]);
    expect(data.keyHash).toBe(hmac(SECRET, "email", EMAIL));
    expect(data.ipHash).toBe(hmac(SECRET, "ip", IP));
    expect(data.success).toBe(false);
    expect(data.blocked).toBe(false);
    expect(data.createdAt).toEqual(NOW);

    const serialized = JSON.stringify(data).toLowerCase();
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("example");
    expect(serialized).not.toContain(IP);
  });

  it("is not a plain sha256 and depends on the secret", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });
    const first = db.create.mock.calls[0][0].data;

    expect(first.keyHash).not.toBe(createHash("sha256").update(EMAIL).digest("hex"));
    expect(first.ipHash).not.toBe(createHash("sha256").update(IP).digest("hex"));

    process.env.AUTH_SECRET = "a-different-secret";
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });
    const second = db.create.mock.calls[1][0].data;

    expect(second.keyHash).not.toBe(first.keyHash);
    expect(second.ipHash).not.toBe(first.ipHash);
  });

  it("separates the email and IP key spaces", async () => {
    await registerAttempt({ email: IP, ip: IP, now: NOW });
    const { data } = db.create.mock.calls[0][0];
    expect(data.keyHash).not.toBe(data.ipHash);
  });

  it("prefers AUTH_SECRET and falls back to NEXTAUTH_SECRET, like next-auth", async () => {
    await registerAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(db.create.mock.calls[0][0].data.keyHash).toBe(hmac(SECRET, "email", EMAIL));

    delete process.env.AUTH_SECRET;
    await registerAttempt({ email: EMAIL, ip: null, now: NOW });
    expect(db.create.mock.calls[1][0].data.keyHash).toBe(hmac(OTHER_SECRET, "email", EMAIL));
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

    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toThrow(/secret/i);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.findMany).not.toHaveBeenCalled();
  });
});

describe("registerAttempt query shape", () => {
  const counted = { success: false, blocked: false, createdAt: { gt: at(-15 * MIN) } };

  it("pre-checks all buckets, then writes a pending row, then counts all buckets again", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });

    expect(db.findMany).toHaveBeenCalledTimes(6);
    const createOrder = db.create.mock.invocationCallOrder[0];
    const orders = db.findMany.mock.invocationCallOrder;
    expect(orders.filter((o) => o < createOrder)).toHaveLength(3);
    expect(orders.filter((o) => o > createOrder)).toHaveLength(3);
    expect(db.create.mock.calls[0][0].data.blocked).toBe(false);
  });

  it("counts only non-blocked failures after the window start, with no upper bound", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });
    const keyHash = hmac(SECRET, "email", EMAIL);
    const ipHash = hmac(SECRET, "ip", IP);
    const expected: Record<BucketName, { where: object; take: number }> = {
      pair: { where: { keyHash, ipHash, ...counted }, take: 6 },
      ip: { where: { ipHash, ...counted }, take: 21 },
      email: { where: { keyHash, ...counted }, take: 51 },
    };

    for (const call of findManyCalls()) {
      const bucket = bucketOf(call.where);
      expect(call.where).toEqual(expected[bucket].where);
      expect(call.take).toBe(expected[bucket].take);
    }
    expect(findManyCalls().map((c) => bucketOf(c.where)).sort()).toEqual(
      ["email", "email", "ip", "ip", "pair", "pair"]
    );
  });

  it("uses (email, ipHash IS NULL) as the pair and skips the IP bucket when ip is null", async () => {
    const result = await registerAttempt({ email: EMAIL, ip: null, now: NOW });
    const keyHash = hmac(SECRET, "email", EMAIL);

    expect(result).toEqual({ allowed: true, attemptId: OWN_ID });
    expect(db.create.mock.calls[0][0].data.ipHash).toBeNull();
    expect(db.findMany).toHaveBeenCalledTimes(4);
    for (const call of findManyCalls()) {
      const bucket = bucketOf(call.where);
      expect(bucket).not.toBe("ip");
      expect(call.where).toEqual(
        bucket === "pair" ? { keyHash, ipHash: null, ...counted } : { keyHash, ...counted }
      );
    }
  });

  it("uses the current time when now is omitted", async () => {
    await registerAttempt({ email: EMAIL, ip: null });
    expect(db.create.mock.calls[0][0].data.createdAt).toEqual(NOW);
  });
});

describe("allowed attempts", () => {
  it("allows exactly at every limit (row just written included) and never blocks or prunes", async () => {
    serveFailures({
      pair: repeat(at(-MIN), 4),
      ip: repeat(at(-MIN), 19),
      email: repeat(at(-MIN), 49),
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: true,
      attemptId: OWN_ID,
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

describe("pre-check: a bucket already at its limit", () => {
  it("inserts the row as blocked directly (never pending), prunes, and does not count again", async () => {
    serveFailures({ pair: repeat(at(-10 * MIN), 5) });

    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });

    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create.mock.calls[0][0].data).toMatchObject({ success: false, blocked: true });
    expect(db.findMany).toHaveBeenCalledTimes(3);
    expect(Math.max(...db.findMany.mock.invocationCallOrder)).toBeLessThan(
      db.create.mock.invocationCallOrder[0]
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: at(-24 * 60 * MIN) } },
    });
    expect(db.create.mock.invocationCallOrder[0]).toBeLessThan(
      db.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it.each<[BucketName, number]>([
    ["pair", 5],
    ["ip", 20],
    ["email", 50],
  ])("denies when the %s bucket already holds %i real failures", async (bucket, limit) => {
    serveFailures({ [bucket]: repeat(at(-10 * MIN), limit) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
    expect(db.create.mock.calls[0][0].data.blocked).toBe(true);
  });

  it("denies at the email limit even when ip is null", async () => {
    serveFailures({ email: repeat(at(-10 * MIN), 50) });
    await expect(registerAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
    expect(db.create.mock.calls[0][0].data.blocked).toBe(true);
  });

  it("only constrains on buckets at their limit, not below it", async () => {
    serveFailures({
      pair: repeat(at(-1 * MIN), 4), // below: no constraint
      ip: repeat(at(-12 * MIN), 20), // at limit
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3 * 60,
    });
  });

  it("takes the latest reopening time across buckets at their limit", async () => {
    serveFailures({
      pair: repeat(at(-14 * MIN), 5), // +1m
      ip: repeat(at(-2 * MIN), 20), // +13m
      email: repeat(at(-8 * MIN), 50), // +7m
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 13 * 60,
    });
  });

  it("rounds partial seconds up", async () => {
    serveFailures({ pair: repeat(at(-10 * MIN + 500), 5) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60 + 1,
    });
  });

  it("is at least 1 second", async () => {
    serveFailures({ pair: repeat(at(-15 * MIN + 1), 5) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });
});

describe("count after insert: concurrent rows land between pre-check and count", () => {
  it("marks the pending row blocked, then prunes, and denies", async () => {
    serveFailures({ pair: { before: repeat(at(-10 * MIN), 4), after: repeat(at(-10 * MIN), 5) } });

    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });

    expect(db.create.mock.calls[0][0].data.blocked).toBe(false);
    expect(db.findMany).toHaveBeenCalledTimes(6);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith({ where: { id: OWN_ID }, data: { blocked: true } });
    const updateOrder = db.update.mock.invocationCallOrder[0];
    expect(Math.max(...db.findMany.mock.invocationCallOrder)).toBeLessThan(updateOrder);
    expect(updateOrder).toBeLessThan(db.deleteMany.mock.invocationCallOrder[0]);
  });

  it("computes retryAfterSeconds without the own (now blocked) row", async () => {
    // others after: [-1m .. -5m] -> 5th newest is -5m -> +10m (counting own would give -4m -> +11m)
    const after = [1, 2, 3, 4, 5].map((m) => at(-m * MIN));
    serveFailures({ pair: { before: after.slice(0, 4), after } });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
  });

  it("excludes the own row by id even when it is not the newest row", async () => {
    // others after: [+1s, -10m x4] -> 5th newest is -10m -> +5m
    const after = [at(1000), ...repeat(at(-10 * MIN), 4)];
    serveFailures({ pair: { before: after.slice(0, 4), after } });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
  });
});

describe("markAttemptSucceeded", () => {
  it("marks the row as success, then deletes rows older than 24 hours", async () => {
    await markAttemptSucceeded("attempt-42");

    expect(db.update).toHaveBeenCalledWith({
      where: { id: "attempt-42" },
      data: { success: true },
    });
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: at(-24 * 60 * MIN) } },
    });
    expect(db.update.mock.invocationCallOrder[0]).toBeLessThan(
      db.deleteMany.mock.invocationCallOrder[0]
    );
  });
});

describe("DB errors propagate (fail-closed)", () => {
  const boom = new Error("db down");
  const preCheckLock = () => serveFailures({ pair: repeat(at(-MIN), 5) });
  const raceLock = () =>
    serveFailures({ pair: { before: repeat(at(-MIN), 4), after: repeat(at(-MIN), 5) } });

  it.each<BucketName>(["pair", "ip", "email"])("when the pre-check read of %s fails", async (bucket) => {
    db.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (bucketOf(args.where) === bucket) throw boom;
      return [];
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.create).not.toHaveBeenCalled();
  });

  it.each<BucketName>(["pair", "ip", "email"])("when the count of %s after the insert fails", async (bucket) => {
    db.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (ownPending && bucketOf(args.where) === bucket) throw boom;
      return ownPending ? [{ id: OWN_ID, createdAt: NOW }] : [];
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when writing the pending row fails", async () => {
    db.create.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when writing the blocked row (pre-check denial) fails", async () => {
    preCheckLock();
    db.create.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("when pruning after a pre-check denial fails", async () => {
    preCheckLock();
    db.deleteMany.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when marking a denied pending row blocked fails", async () => {
    raceLock();
    db.update.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when pruning after a denial at count time fails", async () => {
    raceLock();
    db.deleteMany.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when marking success fails", async () => {
    db.update.mockRejectedValue(boom);
    await expect(markAttemptSucceeded("attempt-1")).rejects.toBe(boom);
  });

  it("when pruning after a success fails", async () => {
    db.deleteMany.mockRejectedValue(boom);
    await expect(markAttemptSucceeded("attempt-1")).rejects.toBe(boom);
  });
});
