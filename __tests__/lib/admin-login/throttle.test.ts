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

type Row = { createdAt: Date };
type FindManyArgs = {
  where: { keyHash?: string; ipHash?: string; success: boolean; createdAt: { gt: Date } };
  orderBy: unknown;
  take: number;
  select: unknown;
};

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

function hmac(secret: string, kind: "email" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`admin-login:${kind}:${value}`).digest("hex");
}

function at(msFromNow: number): Date {
  return new Date(NOW.getTime() + msFromNow);
}

function rows(...dates: Date[]): Row[] {
  return dates.map((createdAt) => ({ createdAt }));
}

function repeat(date: Date, n: number): Date[] {
  return Array.from({ length: n }, () => date);
}

/** Serve findMany from per-bucket rows (newest first), honouring `take`. */
function serveFailures(byBucket: { email: Row[]; ip?: Row[] }) {
  db.findMany.mockImplementation(async (args: FindManyArgs) => {
    const source = args.where.keyHash !== undefined ? byBucket.email : byBucket.ip ?? [];
    return source.slice(0, args.take);
  });
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
  process.env.AUTH_SECRET = SECRET;
  process.env.NEXTAUTH_SECRET = OTHER_SECRET;
  db.create.mockResolvedValue({ id: "attempt-1" });
  db.update.mockResolvedValue({});
  db.deleteMany.mockResolvedValue({ count: 0 });
  serveFailures({ email: rows(NOW), ip: rows(NOW) });
});

afterAll(() => {
  restoreEnv("AUTH_SECRET");
  restoreEnv("NEXTAUTH_SECRET");
});

describe("limits", () => {
  it("uses a 15-minute window, 5 per email, 20 per IP", () => {
    expect(ADMIN_LOGIN_THROTTLE).toEqual({
      windowMs: 15 * MIN,
      emailLimit: 5,
      ipLimit: 20,
      retentionMs: 24 * 60 * MIN,
    });
  });
});

describe("key hashing", () => {
  it("stores HMAC-SHA256 keys of the normalized email and the IP, never the raw values", async () => {
    await registerAttempt({ email: "  Admin@Example.COM ", ip: IP, now: NOW });

    expect(db.create).toHaveBeenCalledTimes(1);
    const { data } = db.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(["createdAt", "ipHash", "keyHash", "success"]);
    expect(data.keyHash).toBe(hmac(SECRET, "email", EMAIL));
    expect(data.ipHash).toBe(hmac(SECRET, "ip", IP));
    expect(data.success).toBe(false);
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
  it("writes the failure row before reading the window", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });

    expect(db.findMany).toHaveBeenCalledTimes(2);
    const createOrder = db.create.mock.invocationCallOrder[0];
    for (const order of db.findMany.mock.invocationCallOrder) {
      expect(createOrder).toBeLessThan(order);
    }
  });

  it("counts failures after the window start with no upper bound", async () => {
    await registerAttempt({ email: EMAIL, ip: IP, now: NOW });

    const calls = db.findMany.mock.calls.map(([args]) => args as FindManyArgs);
    const emailCall = calls.find((c) => c.where.keyHash !== undefined)!;
    const ipCall = calls.find((c) => c.where.ipHash !== undefined)!;

    expect(emailCall.where).toEqual({
      keyHash: hmac(SECRET, "email", EMAIL),
      success: false,
      createdAt: { gt: at(-15 * MIN) },
    });
    expect(emailCall.take).toBe(6);
    expect(ipCall.where).toEqual({
      ipHash: hmac(SECRET, "ip", IP),
      success: false,
      createdAt: { gt: at(-15 * MIN) },
    });
    expect(ipCall.take).toBe(21);
  });

  it("applies only the email limit when ip is null", async () => {
    const result = await registerAttempt({ email: EMAIL, ip: null, now: NOW });

    expect(result).toEqual({ allowed: true, attemptId: "attempt-1" });
    expect(db.create.mock.calls[0][0].data.ipHash).toBeNull();
    expect(db.findMany).toHaveBeenCalledTimes(1);
    expect(db.findMany.mock.calls[0][0].where.keyHash).toBeDefined();
  });

  it("uses the current time when now is omitted", async () => {
    const before = Date.now();
    await registerAttempt({ email: EMAIL, ip: null });
    const after = Date.now();
    const createdAt: Date = db.create.mock.calls[0][0].data.createdAt;
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(createdAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("decision and retryAfterSeconds", () => {
  it("allows exactly at the limit (row just written included)", async () => {
    serveFailures({ email: rows(...repeat(NOW, 5)), ip: rows(...repeat(NOW, 20)) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: true,
      attemptId: "attempt-1",
    });
  });

  it("denies one over the email limit; retry when the 5th newest failure expires", async () => {
    // newest first: the denied row (now), then five failures 10 minutes ago
    serveFailures({ email: rows(NOW, ...repeat(at(-10 * MIN), 5)), ip: rows(NOW) });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60,
    });
  });

  it("counts the denied row itself, so repeated denials push the retry time out", async () => {
    // five denied rows at now plus older failures: the 5th newest is now
    serveFailures({ email: rows(...repeat(NOW, 5), at(-10 * MIN)), ip: rows(NOW) });
    await expect(registerAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("rounds partial seconds up", async () => {
    serveFailures({ email: rows(NOW, ...repeat(at(-10 * MIN + 500), 5)) });
    await expect(registerAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5 * 60 + 1,
    });
  });

  it("is at least 1 second", async () => {
    serveFailures({ email: rows(NOW, ...repeat(at(-15 * MIN + 1), 5)) });
    await expect(registerAttempt({ email: EMAIL, ip: null, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("denies one over the IP limit; retry when the 20th newest IP failure expires", async () => {
    serveFailures({
      email: rows(NOW),
      ip: rows(NOW, ...repeat(at(-12 * MIN), 20)),
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3 * 60,
    });
  });

  it("also waits for an email bucket that is at its limit when the IP trips", async () => {
    // email has exactly 5 incl. this row (fine now, but the next attempt would make 6)
    serveFailures({
      email: rows(NOW, ...repeat(at(-5 * MIN), 4)),
      ip: rows(NOW, ...repeat(at(-12 * MIN), 20)),
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
  });

  it("takes the later of both buckets when both are over", async () => {
    serveFailures({
      email: rows(NOW, ...repeat(at(-14 * MIN), 5)),
      ip: rows(NOW, ...repeat(at(-2 * MIN), 20)),
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 13 * 60,
    });
  });
});

describe("markAttemptSucceeded", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks the row as success, then deletes rows older than 24 hours", async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });

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

  it("when writing the attempt fails", async () => {
    db.create.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("when reading the window fails", async () => {
    db.findMany.mockRejectedValue(boom);
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when reading only the IP bucket fails", async () => {
    db.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (args.where.ipHash !== undefined) throw boom;
      return rows(NOW);
    });
    await expect(registerAttempt({ email: EMAIL, ip: IP, now: NOW })).rejects.toBe(boom);
  });

  it("when marking success fails", async () => {
    db.update.mockRejectedValue(boom);
    await expect(markAttemptSucceeded("attempt-1")).rejects.toBe(boom);
  });

  it("when pruning old rows fails", async () => {
    db.deleteMany.mockRejectedValue(boom);
    await expect(markAttemptSucceeded("attempt-1")).rejects.toBe(boom);
  });
});
