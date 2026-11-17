/**
 * @jest-environment node
 *
 * Integration tests for the admin login throttle against a real, disposable
 * local Postgres. Runs only when ADMIN_LOGIN_TEST_DATABASE_URL is set, e.g.
 *
 *   ADMIN_LOGIN_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/<disposable_db> npx jest
 *
 * The URL must point at localhost and must not use port 5433 (the production
 * tunnel). The schema must already be pushed to that database.
 */

import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type ThrottleModule = typeof import("@/lib/admin-login/throttle");

const TEST_DATABASE_URL = process.env.ADMIN_LOGIN_TEST_DATABASE_URL;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const FORBIDDEN_PORT = "5433";

function assertDisposableDatabaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`ADMIN_LOGIN_TEST_DATABASE_URL must be a postgres URL, got ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`ADMIN_LOGIN_TEST_DATABASE_URL host must be local, got ${host}`);
  }
  const port = url.port || "5432";
  if (port === FORBIDDEN_PORT) {
    throw new Error("ADMIN_LOGIN_TEST_DATABASE_URL must not use port 5433 (production tunnel)");
  }
  return url;
}

// Always runs (no connection): the guard must reject non-disposable targets.
describe("assertDisposableDatabaseUrl", () => {
  it.each([
    ["the production tunnel port", "postgresql://u:p@127.0.0.1:5433/flowmate"],
    ["the production tunnel port on localhost", "postgresql://u:p@localhost:5433/flowmate_test"],
    ["the production tunnel port on [::1]", "postgresql://u:p@[::1]:5433/flowmate_test"],
    ["a remote host", "postgresql://u:p@db.example.com:6432/flowmate"],
    ["a private-network host", "postgresql://u:p@10.0.0.5:55432/flowmate_test"],
    ["a non-postgres URL", "mysql://u:p@127.0.0.1:55432/flowmate_test"],
  ])("rejects %s", (_label, raw) => {
    expect(() => assertDisposableDatabaseUrl(raw)).toThrow();
  });

  it.each([
    ["127.0.0.1 on a test port", "postgresql://u:p@127.0.0.1:55432/flowmate_test"],
    ["[::1] on a test port", "postgresql://u:p@[::1]:55432/flowmate_test"],
    ["localhost without a port", "postgres://u:p@localhost/flowmate_test"],
  ])("accepts %s", (_label, raw) => {
    expect(() => assertDisposableDatabaseUrl(raw)).not.toThrow();
  });
});

const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;
const suiteTitle = TEST_DATABASE_URL
  ? "admin login throttle (integration, disposable Postgres)"
  : "admin login throttle (integration) — SKIPPED: set ADMIN_LOGIN_TEST_DATABASE_URL to a disposable local Postgres";

describeWithDb(suiteTitle, () => {
  const SECRET = `throttle-integration-${randomUUID()}`;
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const MIN = 60 * 1000;
  // Anchor to the real clock: markAttemptSucceeded prunes by real time.
  const base = Math.floor(Date.now() / 1000) * 1000;
  const at = (seconds: number) => new Date(base + seconds * 1000);

  const usedEmails = new Set<string>();
  const usedIps = new Set<string>();
  const savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
  };

  let prisma: PrismaClient;
  let throttle: ThrottleModule;

  const keyHashOf = (value: string) =>
    createHmac("sha256", SECRET)
      .update(`admin-login:email:${value.trim().toLowerCase()}`)
      .digest("hex");
  const ipHashOf = (value: string) =>
    createHmac("sha256", SECRET).update(`admin-login:ip:${value}`).digest("hex");

  const email = (label: string) => {
    const value = `admin-${runId}-${label}@example.com`;
    usedEmails.add(value);
    return value;
  };
  const ip = (n: number) => {
    // IPv6 documentation prefix, unique per run
    const value = `2001:db8:${runId.slice(0, 4)}:${runId.slice(4)}::${n.toString(16)}`;
    usedIps.add(value);
    return value;
  };

  const attempt = (e: string, i: string | null, now: Date) =>
    throttle.registerAttempt({ email: e, ip: i, now });

  beforeAll(async () => {
    // Guard first: nothing below may run against a non-disposable database.
    const url = assertDisposableDatabaseUrl(TEST_DATABASE_URL as string);

    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.AUTH_SECRET = SECRET;
    // Import after DATABASE_URL is set so the Prisma singleton uses it.
    prisma = (await import("@/lib/prisma")).prisma;
    throttle = await import("@/lib/admin-login/throttle");

    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(db).toBe(decodeURIComponent(url.pathname.slice(1)));
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.adminLoginAttempt.deleteMany({
        where: {
          OR: [
            { keyHash: { in: [...usedEmails].map(keyHashOf) } },
            { ipHash: { in: [...usedIps].map(ipHashOf) } },
          ],
        },
      });
      await prisma.$disconnect();
    }
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const countRows = (where: { keyHash?: string; ipHash?: string | null; blocked?: boolean; success?: boolean }) =>
    prisma.adminLoginAttempt.count({ where });

  it("locks an email+IP pair after 5 failures; retryAfterSeconds is exact; it reopens on time", async () => {
    const e = email("pair");
    const a = ip(1);
    for (let i = 0; i < 5; i++) {
      await expect(attempt(e, a, at(0))).resolves.toMatchObject({ allowed: true });
    }

    await expect(attempt(e, a, at(60))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 60,
    });
    expect(await countRows({ keyHash: keyHashOf(e), ipHash: ipHashOf(a), blocked: false })).toBe(5);
    expect(await countRows({ keyHash: keyHashOf(e), ipHash: ipHashOf(a), blocked: true })).toBe(1);

    // one second early: still locked, and the retry time did not move
    await expect(attempt(e, a, at(899))).resolves.toEqual({ allowed: false, retryAfterSeconds: 1 });
    // exactly when the 5th newest real failure leaves the window
    await expect(attempt(e, a, at(900))).resolves.toMatchObject({ allowed: true });
  });

  it("treats an unknown IP as its own pair (email, no IP)", async () => {
    const e = email("no-ip");
    for (let i = 0; i < 5; i++) {
      await expect(attempt(e, null, at(0))).resolves.toMatchObject({ allowed: true });
    }
    await expect(attempt(e, null, at(1))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 1,
    });
    // the same email from a known IP is a different pair
    await expect(attempt(e, ip(2), at(2))).resolves.toMatchObject({ allowed: true });
  });

  it("buckets the email case- and whitespace-insensitively", async () => {
    const e = email("case");
    const variants = [e, e.toUpperCase(), ` ${e}`, `${e}\t`, e.replace("admin", "ADMIN")];
    for (const v of variants) {
      await expect(attempt(v, null, at(0))).resolves.toMatchObject({ allowed: true });
    }
    await expect(attempt(e, null, at(1))).resolves.toMatchObject({ allowed: false });
  });

  it("denied attempts do not extend the lock and do not count toward the IP or email-wide limits", async () => {
    const e = email("hammer");
    const a = ip(3);
    for (let i = 0; i < 5; i++) await attempt(e, a, at(0));

    // one IP hammers the same email 100 times while locked
    for (let i = 0; i < 100; i++) {
      const t = 10 + i * 5;
      await expect(attempt(e, a, at(t))).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 900 - t,
      });
    }

    expect(await countRows({ keyHash: keyHashOf(e), success: false, blocked: false })).toBe(5);
    expect(await countRows({ keyHash: keyHashOf(e), blocked: true })).toBe(100);

    // the IP bucket saw only 5 real failures, so another email from that IP is fine
    await expect(attempt(email("hammer-other"), a, at(506))).resolves.toMatchObject({
      allowed: true,
    });
    // the lock clears 15 minutes after the 5th newest real failure, not after the last denial
    await expect(attempt(e, a, at(900))).resolves.toMatchObject({ allowed: true });
  });

  it("still allows the same email from a different IP after one IP's pair is locked", async () => {
    const e = email("other-ip");
    const a = ip(4);
    for (let i = 0; i < 5; i++) await attempt(e, a, at(0));
    await expect(attempt(e, a, at(10))).resolves.toMatchObject({ allowed: false });

    await expect(attempt(e, ip(5), at(11))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(e, null, at(12))).resolves.toMatchObject({ allowed: true });
  });

  it("locks the email everywhere after 50 real failures from 10 IPs", async () => {
    const e = email("global");
    for (let k = 0; k < 10; k++) {
      const source = ip(100 + k);
      for (let i = 0; i < 5; i++) {
        await expect(attempt(e, source, at(0))).resolves.toMatchObject({ allowed: true });
      }
    }

    // an 11th IP, and an unknown IP, are both denied by the email-wide limit
    await expect(attempt(e, ip(110), at(30))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 30,
    });
    await expect(attempt(e, null, at(31))).resolves.toMatchObject({ allowed: false });
    expect(await countRows({ keyHash: keyHashOf(e), blocked: false })).toBe(50);

    // other emails from those IPs are unaffected (each IP has only 5 real failures)
    await expect(attempt(email("global-other"), ip(100), at(32))).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("limits one IP to 20 real failures across different emails", async () => {
    const shared = ip(6);
    for (let i = 0; i < 20; i++) {
      await expect(attempt(email(`ip-${i}`), shared, at(0))).resolves.toMatchObject({
        allowed: true,
      });
    }

    const late = email("ip-20");
    await expect(attempt(late, shared, at(30))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 30,
    });
    expect(await countRows({ ipHash: ipHashOf(shared), blocked: false })).toBe(20);

    // other IPs, unknown IPs, and the denied email elsewhere are not affected
    await expect(attempt(email("ip-21"), ip(7), at(31))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(email("ip-22"), null, at(32))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(late, ip(8), at(33))).resolves.toMatchObject({ allowed: true });
  });

  it("keeps earlier failures in the window after a success", async () => {
    const e = email("success");
    const a = ip(9);
    for (let i = 0; i < 4; i++) await attempt(e, a, at(0));

    const ok = await attempt(e, a, at(10));
    expect(ok.allowed).toBe(true);
    if (!ok.allowed) return;
    await throttle.markAttemptSucceeded(ok.attemptId);

    const row = await prisma.adminLoginAttempt.findUniqueOrThrow({ where: { id: ok.attemptId } });
    expect(row).toMatchObject({ success: true, blocked: false });
    expect(await countRows({ keyHash: keyHashOf(e), success: false })).toBe(4);

    // 4 earlier failures + this one = 5: allowed. Then 6: denied.
    await expect(attempt(e, a, at(20))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(e, a, at(30))).resolves.toMatchObject({ allowed: false });
  });

  describe("concurrency", () => {
    const allowedCount = (results: { allowed: boolean }[]) => results.filter((r) => r.allowed).length;

    it("allows at most 5 of 10 concurrent attempts for one fresh email (no IP)", async () => {
      for (let round = 0; round < 5; round++) {
        const e = email(`concurrent-${round}`);
        const results = await Promise.all(
          Array.from({ length: 10 }, () => attempt(e, null, at(0)))
        );
        expect(allowedCount(results)).toBeLessThanOrEqual(5);
        expect(await countRows({ keyHash: keyHashOf(e) })).toBe(10);
      }
    });

    it("allows at most 5 of 10 concurrent attempts for one fresh email+IP pair", async () => {
      for (let round = 0; round < 5; round++) {
        const e = email(`concurrent-pair-${round}`);
        const a = ip(200 + round);
        const results = await Promise.all(Array.from({ length: 10 }, () => attempt(e, a, at(0))));
        expect(allowedCount(results)).toBeLessThanOrEqual(5);
        expect(await countRows({ keyHash: keyHashOf(e), ipHash: ipHashOf(a) })).toBe(10);
      }
    });

    it("allows at most 5 per pair when two IPs hit one email concurrently", async () => {
      for (let round = 0; round < 3; round++) {
        const e = email(`concurrent-two-ips-${round}`);
        const a = ip(300 + round * 2);
        const b = ip(301 + round * 2);
        const [fromA, fromB] = await Promise.all([
          Promise.all(Array.from({ length: 10 }, () => attempt(e, a, at(0)))),
          Promise.all(Array.from({ length: 10 }, () => attempt(e, b, at(0)))),
        ]);
        expect(allowedCount(fromA)).toBeLessThanOrEqual(5);
        expect(allowedCount(fromB)).toBeLessThanOrEqual(5);
        expect(await countRows({ keyHash: keyHashOf(e) })).toBe(20);
      }
    });

    it("allows at most 20 of 30 concurrent attempts from one IP", async () => {
      const shared = ip(400);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => attempt(email(`concurrent-ip-${i}`), shared, at(0)))
      );
      expect(allowedCount(results)).toBeLessThanOrEqual(20);
      expect(await countRows({ ipHash: ipHashOf(shared) })).toBe(30);
    });

    it("allows at most 50 of 60 concurrent attempts for one email from 60 IPs", async () => {
      const e = email("concurrent-global");
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) => attempt(e, ip(500 + i), at(0)))
      );
      expect(allowedCount(results)).toBeLessThanOrEqual(50);
      expect(await countRows({ keyHash: keyHashOf(e) })).toBe(60);
    });
  });

  describe("pruning rows older than 24 hours", () => {
    const longAgo = () => new Date(Date.now() - 25 * 60 * MIN);

    it("happens in markAttemptSucceeded", async () => {
      const old = email("old-success");
      await attempt(old, null, longAgo());
      expect(await countRows({ keyHash: keyHashOf(old) })).toBe(1);

      const ok = await attempt(email("fresh-success"), null, new Date());
      expect(ok.allowed).toBe(true);
      if (!ok.allowed) return;
      await throttle.markAttemptSucceeded(ok.attemptId);

      expect(await countRows({ keyHash: keyHashOf(old) })).toBe(0);
      const row = await prisma.adminLoginAttempt.findUniqueOrThrow({ where: { id: ok.attemptId } });
      expect(row.success).toBe(true);
    });

    it("happens when an attempt is denied", async () => {
      const old = email("old-denied");
      await attempt(old, null, longAgo());
      expect(await countRows({ keyHash: keyHashOf(old) })).toBe(1);

      const e = email("fresh-denied");
      const now = new Date();
      for (let i = 0; i < 5; i++) await attempt(e, null, now);
      expect(await countRows({ keyHash: keyHashOf(old) })).toBe(1); // allowed attempts do not prune

      await expect(attempt(e, null, now)).resolves.toMatchObject({ allowed: false });
      expect(await countRows({ keyHash: keyHashOf(old) })).toBe(0);
      expect(await countRows({ keyHash: keyHashOf(e) })).toBe(6);
    });
  });
});
