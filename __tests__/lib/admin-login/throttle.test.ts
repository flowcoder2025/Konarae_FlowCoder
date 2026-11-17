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

let rowSeq = 0;
/** Rows newest first. The own row (just written) is always the first one. */
function withOwn(...others: Date[]): Row[] {
  return [{ id: OWN_ID, createdAt: NOW }, ...others.map((createdAt) => ({ id: `r${++rowSeq}`, createdAt }))];
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

/** Serve findMany from per-bucket rows (newest first), honouring `take`. */
function serveFailures(byBucket: Partial<Record<BucketName, Row[]>>) {
  db.findMany.mockImplementation(async (args: FindManyArgs) => {
    return (byBucket[bucketOf(args.where)] ?? withOwn()).slice(0, args.take);
  });
}

function findManyCall(bucket: BucketName): FindManyArgs {
  const call = db.findMany.mock.calls.map(([args]) => args as FindManyArgs).find((args) => bucketOf(args.where) === bucket);
  if (!call) throw new Error(`no findMany call for ${bucket}`);
  return call;
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
  db.create.mockResolvedValue({ id: OWN_ID });
  db.update.mockResolvedValue({});
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

  it("writes the failure row before reading any bucket", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });

    expect(db.findMany).toHaveBeenCalledTimes(3);
    const createOrder = db.create.mock.invocationCallOrder[0];
    for (const order of db.findMany.mock.invocationCallOrder) {
      expect(createOrder).toBeLessThan(order);
    }
  });

  it("counts only non-blocked failures after the window start, with no upper bound", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });
    const keyHash = hmac(SECRET, "email", EMAIL);
    const ipHash = hmac(SECRET, "ip", IP);

    expect(findManyCall("pair").where).toEqual({ keyHash, ipHash, ...counted });
    expect(findManyCall("pair").take).toBe(6);
    expect(findManyCall("ip").where).toEqual({ ipHash, ...counted });
    expect(findManyCall("ip").take).toBe(21);
    expect(findManyCall("email").where).toEqual({ keyHash, ...counted });
    expect(findManyCall("email").take).toBe(51);
  });

  it("uses (email, ipHash IS NULL) as the pair and skips the IP bucket when ip is null", async () => {
    const result = await registerAttempt({ email: EMAIL, ip: null, now: NOW });
    const keyHash = hmac(SECRET, "email", EMAIL);

    expect(result).toEqual({ allowed: true, attemptId: OWN_ID });
    expect(db.create.mock.calls[0][0].data.ipHash).toBeNull();
    expect(db.findMany).toHaveBeenCalledTimes(2);
    expect(findManyCall("pair").where).toEqual({ keyHash, ipHash: null, ...counted });
    expect(findManyCall("email").where).toEqual({ keyHash, ...counted });
  });

  it("uses the current time when now is omitted", async () => {
    await registerAttempt({ email: EMAIL, ip: null });
    expect(db.create.mock.calls[0][0].data.createdAt).toEqual(NOW);
  });
});

describe("allowed attempts", () => {
  it("allows exactly at every limit (row just written included) and never blocks or prunes", async () => {
    serveFailures({
      pair: withOwn(...repeat(at(-MIN), 4)),
      ip: withOwn(...repeat(at(-MIN), 19)),
      email: withOwn(...repeat(at(-MIN), 49)),
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: true,
      attemptId: OWN_ID,
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

describe("denied attempts", () => {
  it("marks the just-written row blocked, prunes rows older than 24h, in that order", async () => {
    serveFailures({ pair: withOwn(...repeat(at(-10 * MIN), 5)) });

    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toMatchObject({
      allowed: false,
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith({ where: { id: OWN_ID }, data: { blocked: true } });
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: at(-24 * 60 * MIN) } },
    });
    const findOrders = db.findMany.mock.invocationCallOrder;
    const updateOrder = db.update.mock.invocationCallOrder[0];
    expect(Math.max(...findOrders)).toBeLessThan(updateOrder);
    expect(updateOrder).toBeLessThan(db.deleteMany.mock.invocationCallOrder[0]);
  });

  it.each<[BucketName, number]>([
    ["pair", 5],
    ["ip", 20],
    ["email", 50],
  ])("denies one over the %s limit", async (bucket, limit) => {
    serveFailures({ [bucket]: withOwn(...repeat(at(-10 * MIN), limit)) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
  });

  it("denies over the email limit even when ip is null", async () => {
    serveFailures({ email: withOwn(...repeat(at(-10 * MIN), 50)) });
    await expect(registerAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
  });
});

describe("retryAfterSeconds", () => {
  it("is when the limit-th newest real failure (excluding the blocked own row) expires", async () => {
    // excluding own: [-1m, -2m, -3m, -4m, -5m] -> 5th newest is -5m -> reopens at +10m
    // (counting own would give -4m -> +11m)
    serveFailures({ pair: withOwn(at(-1 * MIN), at(-2 * MIN), at(-3 * MIN), at(-4 * MIN), at(-5 * MIN)) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
  });

  it("excludes the own row by id even when it is not the newest row", async () => {
    const rows: Row[] = [
      { id: "later-1", createdAt: at(1000) },
      { id: OWN_ID, createdAt: NOW },
      ...repeat(at(-10 * MIN), 4).map((createdAt, i) => ({ id: `old-${i}`, createdAt })),
    ];
    serveFailures({ pair: rows });
    // others newest first: [+1s, -10m x4] -> 5th newest is -10m -> +5m
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
  });

  it("ignores buckets that are at, but not over, their limit", async () => {
    serveFailures({
      pair: withOwn(...repeat(at(-1 * MIN), 4)), // 5 incl. own: not over
      ip: withOwn(...repeat(at(-12 * MIN), 20)), // over
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3 * 60,
    });
  });

  it("takes the latest reopening time across exceeded buckets", async () => {
    serveFailures({
      pair: withOwn(...repeat(at(-14 * MIN), 5)), // +1m
      ip: withOwn(...repeat(at(-2 * MIN), 20)), // +13m
      email: withOwn(...repeat(at(-8 * MIN), 50)), // +7m
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 13 * 60,
    });
  });

  it("rounds partial seconds up", async () => {
    serveFailures({ pair: withOwn(...repeat(at(-10 * MIN + 500), 5)) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60 + 1,
    });
  });

  it("is at least 1 second", async () => {
    serveFailures({ pair: withOwn(...repeat(at(-15 * MIN + 1), 5)) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
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
  const lockPair = () => serveFailures({ pair: withOwn(...repeat(at(-MIN), 5)) });

  it("when writing the attempt fails", async () => {
    db.create.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it.each<BucketName>(["pair", "ip", "email"])("when reading the %s bucket fails", async (bucket) => {
    db.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (bucketOf(args.where) === bucket) throw boom;
      return withOwn();
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when marking a denied row blocked fails", async () => {
    lockPair();
    db.update.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when pruning after a denial fails", async () => {
    lockPair();
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
