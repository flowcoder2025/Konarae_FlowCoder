/**
 * @jest-environment node
 *
 * Integration tests for the admin login throttle against a real, disposable
 * local Postgres. Runs only when ADMIN_LOGIN_TEST_DATABASE_URL is set, e.g.
 *
 *   ADMIN_LOGIN_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/flowmate_test npx jest
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

  it("allows 5 failures, denies the 6th with retryAfterSeconds, and allows again when it elapses", async () => {
    const e = email("lock");
    for (let i = 0; i < 5; i++) {
      await expect(attempt(e, null, at(0))).resolves.toMatchObject({ allowed: true });
    }

    const denied = await attempt(e, null, at(60));
    expect(denied).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 - 60 });

    const stored = await prisma.adminLoginAttempt.findMany({ where: { keyHash: keyHashOf(e) } });
    expect(stored).toHaveLength(6);
    expect(stored.every((row) => row.success === false && row.ipHash === null)).toBe(true);

    // exactly retryAfterSeconds later the five old failures are out of the window
    await expect(attempt(e, null, at(60 + 840))).resolves.toMatchObject({ allowed: true });
  });

  it("still denies one second before retryAfterSeconds elapses", async () => {
    const e = email("boundary");
    for (let i = 0; i < 5; i++) await attempt(e, null, at(0));
    await expect(attempt(e, null, at(60))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 840,
    });
    await expect(attempt(e, null, at(60 + 839))).resolves.toMatchObject({ allowed: false });
  });

  it("buckets the email case- and whitespace-insensitively", async () => {
    const e = email("case");
    const variants = [e, e.toUpperCase(), ` ${e}`, `${e}\t`, e.replace("admin", "ADMIN")];
    for (const v of variants) {
      await expect(attempt(v, null, at(0))).resolves.toMatchObject({ allowed: true });
    }
    await expect(attempt(e, null, at(1))).resolves.toMatchObject({ allowed: false });
  });

  it("records denied attempts too, so retrying during a lock extends it", async () => {
    const e = email("extend");
    for (let i = 0; i < 5; i++) await attempt(e, null, at(0));

    const retries: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await attempt(e, null, at(600));
      expect(result.allowed).toBe(false);
      if (!result.allowed) retries.push(result.retryAfterSeconds);
    }
    // the fifth denial at t=600 makes t=600 the 5th newest failure
    expect(retries).toEqual([300, 300, 300, 300, 900]);

    // Without the recorded denials this would be allowed (t=0 rows expired at 900).
    await expect(attempt(e, null, at(901))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 600 + 900 - 901,
    });
    await expect(attempt(e, null, at(1500))).resolves.toMatchObject({ allowed: true });
  });

  it("keeps earlier failures in the window after a success", async () => {
    const e = email("success");
    for (let i = 0; i < 4; i++) await attempt(e, null, at(0));

    const ok = await attempt(e, null, at(10));
    expect(ok.allowed).toBe(true);
    if (!ok.allowed) return;
    await throttle.markAttemptSucceeded(ok.attemptId);

    const row = await prisma.adminLoginAttempt.findUniqueOrThrow({ where: { id: ok.attemptId } });
    expect(row.success).toBe(true);
    expect(
      await prisma.adminLoginAttempt.count({ where: { keyHash: keyHashOf(e), success: false } })
    ).toBe(4);

    // 4 earlier failures + this one = 5: allowed. Then 6: denied.
    await expect(attempt(e, null, at(20))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(e, null, at(30))).resolves.toMatchObject({ allowed: false });
  });

  it("limits one IP to 20 failures across different emails", async () => {
    const shared = ip(1);
    for (let i = 0; i < 20; i++) {
      await expect(attempt(email(`ip-${i}`), shared, at(0))).resolves.toMatchObject({
        allowed: true,
      });
    }

    await expect(attempt(email("ip-20"), shared, at(30))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 30,
    });
    expect(await prisma.adminLoginAttempt.count({ where: { ipHash: ipHashOf(shared) } })).toBe(21);

    // other IPs and IP-less attempts are not affected
    await expect(attempt(email("ip-21"), ip(2), at(31))).resolves.toMatchObject({ allowed: true });
    await expect(attempt(email("ip-22"), null, at(32))).resolves.toMatchObject({ allowed: true });
  });

  it("allows at most 5 of 10 concurrent attempts for one fresh email", async () => {
    for (let round = 0; round < 5; round++) {
      const e = email(`concurrent-${round}`);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => attempt(e, null, at(0)))
      );
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBeLessThanOrEqual(5);
      expect(await prisma.adminLoginAttempt.count({ where: { keyHash: keyHashOf(e) } })).toBe(10);
    }
  });

  it("allows at most 20 of 30 concurrent attempts from one IP", async () => {
    const shared = ip(3);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => attempt(email(`concurrent-ip-${i}`), shared, at(0)))
    );
    expect(results.filter((r) => r.allowed).length).toBeLessThanOrEqual(20);
    expect(await prisma.adminLoginAttempt.count({ where: { ipHash: ipHashOf(shared) } })).toBe(30);
  });

  it("markAttemptSucceeded prunes rows older than 24 hours", async () => {
    const old = email("old");
    const fresh = email("fresh");
    await attempt(old, null, new Date(Date.now() - 25 * 60 * MIN));
    expect(await prisma.adminLoginAttempt.count({ where: { keyHash: keyHashOf(old) } })).toBe(1);

    const ok = await attempt(fresh, null, new Date());
    expect(ok.allowed).toBe(true);
    if (!ok.allowed) return;
    await throttle.markAttemptSucceeded(ok.attemptId);

    expect(await prisma.adminLoginAttempt.count({ where: { keyHash: keyHashOf(old) } })).toBe(0);
    const row = await prisma.adminLoginAttempt.findUniqueOrThrow({ where: { id: ok.attemptId } });
    expect(row.success).toBe(true);
  });
});
