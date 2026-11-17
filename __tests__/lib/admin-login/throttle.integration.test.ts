/**
 * @jest-environment node
 *
 * Integration tests for the admin login throttle against a real, disposable
 * local Postgres. Runs only when ADMIN_LOGIN_TEST_DATABASE_URL is set, e.g.
 *
 *   ADMIN_LOGIN_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/<disposable_db> npx jest
 *
 * The URL must point at localhost and must not use port 5433 (the production
 * tunnel). The schema must already be pushed to that database. To run through
 * PgBouncer in transaction mode (as production), point the URL at a local
 * PgBouncer and add `pgbouncer=true&connection_limit=1`.
 *
 * Attempts are spread over ADMIN_LOGIN_TEST_CLIENTS (default 8) independent
 * PrismaClient instances, each standing for one server instance, so
 * concurrent attempts really run on different connections.
 *
 * Every test uses its own emails and IPs. Pruning is global and follows the
 * `now` passed in, so `now` stays within base + ~16 minutes: far enough to
 * cover a window, close enough not to prune rows of the authorize integration
 * test that may run in parallel against the same database.
 */

import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/admin-login/password";
import {
  assertDisposableDatabaseUrl,
  loadIsolated,
  withDefaultConnectionLimit,
  type Isolated,
} from "./disposable-db";

type ThrottleModule = typeof import("@/lib/admin-login/throttle");
type AuthorizeModule = typeof import("@/lib/admin-login/authorize");
type Result = Awaited<ReturnType<ThrottleModule["consumeAttempt"]>>;

const TEST_DATABASE_URL = process.env.ADMIN_LOGIN_TEST_DATABASE_URL;

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
  const CLIENTS = Number(process.env.ADMIN_LOGIN_TEST_CLIENTS ?? 8);
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const base = Math.floor(Date.now() / 1000) * 1000;
  const at = (seconds: number) => new Date(base + seconds * 1000);

  const savedEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    ADMIN_LOGIN_EMAIL: process.env.ADMIN_LOGIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    VERCEL: process.env.VERCEL,
  };

  let instances: Isolated<ThrottleModule>[] = [];
  let db: PrismaClient;
  const usedKeys = new Set<string>();
  const createdUserIds: string[] = [];

  const hmac = (input: string) =>
    createHmac("sha256", SECRET).update(`admin-login:${input}`).digest("hex");
  const ipKey = (ip: string) => hmac(`ip:${ip}`);
  const pairKey = (email: string, ip: string) => hmac(`pair:${email}\n${ip}`);
  const emailKey = (email: string) => hmac(`email:${email}`);

  const email = (label: string) => `admin-${runId}-${label}@example.com`;
  // IPv6 documentation prefix, unique per run
  const ip = (n: number) => `2001:db8:${runId.slice(0, 4)}:${runId.slice(4)}::${n.toString(16)}`;

  let next = 0;
  /** One attempt on the next client instance (round robin). */
  const attempt = (e: string, i: string | null, now: Date): Promise<Result> => {
    usedKeys.add(emailKey(e));
    if (i) {
      usedKeys.add(ipKey(i));
      usedKeys.add(pairKey(e, i));
    }
    const instance = instances[next++ % instances.length];
    return instance.module.consumeAttempt({ email: e, ip: i, now });
  };
  const concurrently = (n: number, make: (index: number) => Promise<Result>) =>
    Promise.all(Array.from({ length: n }, (_, index) => make(index)));
  const allowedCount = (results: Result[]) => results.filter((r) => r.allowed).length;
  const bucket = (key: string) => db.adminLoginBucket.findUnique({ where: { key } });
  const existing = async (keys: string[]) =>
    db.adminLoginBucket.count({ where: { key: { in: keys } } });

  beforeAll(async () => {
    // Guard first: nothing below may run against a non-disposable database.
    const url = assertDisposableDatabaseUrl(TEST_DATABASE_URL as string);
    process.env.AUTH_SECRET = SECRET;

    const datasourceUrl = withDefaultConnectionLimit(TEST_DATABASE_URL as string, 4);
    instances = Array.from({ length: CLIENTS }, () =>
      loadIsolated<ThrottleModule>("@/lib/admin-login/throttle", datasourceUrl)
    );
    db = instances[0].client;

    const [{ db: name }] = await db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(name).toBe(decodeURIComponent(url.pathname.slice(1)));
  });

  afterAll(async () => {
    if (db) {
      await db.adminLoginBucket.deleteMany({ where: { key: { in: [...usedKeys] } } });
      if (createdUserIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    }
    await Promise.all(instances.map((instance) => instance.client.$disconnect()));
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("SQL per step (Prisma query log)", () => {
    const DATA = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
    // Prisma wraps some statements in BEGIN/COMMIT, and with pgbouncer=true
    // every statement, after a DEALLOCATE ALL. Nothing else may appear.
    const CONTROL = new Set(["BEGIN", "COMMIT", "DEALLOCATE"]);
    const kind = (query: string) => query.trim().split(/\s+/)[0].toUpperCase();

    /** Data statements in order; fails on anything unexpected or two in one transaction. */
    function dataStatements(queries: string[]): string[] {
      let inTransaction = false;
      let inThisTransaction = 0;
      const statements: string[] = [];
      for (const query of queries) {
        const k = kind(query);
        if (k === "BEGIN") {
          expect(inTransaction).toBe(false);
          inTransaction = true;
          inThisTransaction = 0;
        } else if (k === "COMMIT") {
          expect(inTransaction).toBe(true);
          inTransaction = false;
        } else if (DATA.has(k)) {
          if (inTransaction) expect(++inThisTransaction).toBe(1);
          statements.push(k);
        } else {
          expect(CONTROL.has(k) ? k : `unexpected: ${query}`).toBe(k);
        }
      }
      expect(inTransaction).toBe(false);
      return statements;
    }

    async function logged(run: () => Promise<Result>): Promise<{ result: Result; queries: string[] }> {
      const instance = instances[0];
      await new Promise((resolve) => setImmediate(resolve));
      instance.queries.length = 0;
      const result = await run();
      await new Promise((resolve) => setImmediate(resolve));
      return { result, queries: [...instance.queries] };
    }
    const once = (e: string, now: Date) => () => {
      usedKeys.add(emailKey(e));
      return instances[0].module.consumeAttempt({ email: e, ip: null, now });
    };

    it("increment and reset are one conditional UPDATE each; create is one INSERT", async () => {
      const e = email("sql");

      // missing: increment misses, reset misses, read, insert; then prune
      const fresh = await logged(once(e, at(0)));
      expect(fresh.result).toEqual({ allowed: true });
      expect(dataStatements(fresh.queries)).toEqual(["UPDATE", "UPDATE", "SELECT", "INSERT", "DELETE"]);
      const [increment, reset] = fresh.queries.filter((q) => kind(q) === "UPDATE");
      expect(increment).toMatch(/SET "count" = \("public"\."admin_login_buckets"\."count" \+ \$1\)/);
      expect(increment).toMatch(/WHERE \(.*"key" = \$2 AND .*"windowStart" > \$3 AND .*"count" < \$4\)$/);
      expect(reset).toMatch(/SET "count" = \$1, "windowStart" = \$2/);
      expect(reset).toMatch(/WHERE \(.*"key" = \$3 AND .*"windowStart" <= \$4\)$/);
      const [insert] = fresh.queries.filter((q) => kind(q) === "INSERT");
      expect(insert).toMatch(/^INSERT INTO "public"\."admin_login_buckets"/);

      // running, below the limit: the increment alone decides
      const running = await logged(once(e, at(1)));
      expect(running.result).toEqual({ allowed: true });
      expect(dataStatements(running.queries)).toEqual(["UPDATE", "DELETE"]);

      // full: both updates miss, one read, no write
      for (let i = 2; i < 50; i++) await once(e, at(1))();
      const full = await logged(once(e, at(2)));
      expect(full.result).toEqual({ allowed: false, retryAfterSeconds: 898 });
      expect(dataStatements(full.queries)).toEqual(["UPDATE", "UPDATE", "SELECT", "DELETE"]);

      // window over: the reset decides
      const reset2 = await logged(once(e, at(900)));
      expect(reset2.result).toEqual({ allowed: true });
      expect(dataStatements(reset2.queries)).toEqual(["UPDATE", "UPDATE", "DELETE"]);
      await expect(bucket(emailKey(e))).resolves.toMatchObject({ windowStart: at(900), count: 1 });
    });
  });

  describe("exact counts under concurrency", () => {
    it.each([
      [10, 5],
      [60, 3],
    ])("allows exactly 5 of %i concurrent attempts on one fresh email+IP pair (%i rounds)", async (n, rounds) => {
      for (let round = 0; round < rounds; round++) {
        const e = email(`pair-${n}-${round}`);
        const x = ip(1000 + n * 10 + round);
        const results = await concurrently(n, () => attempt(e, x, at(0)));

        expect(allowedCount(results)).toBe(5);
        await expect(bucket(ipKey(x))).resolves.toMatchObject({ count: Math.min(n, 20) });
        await expect(bucket(pairKey(e, x))).resolves.toMatchObject({ count: 5 });
        await expect(bucket(emailKey(e))).resolves.toMatchObject({ count: 5 });
      }
    });

    it("allows exactly 20 of 30 concurrent attempts from one IP over 30 emails (3 rounds)", async () => {
      for (let round = 0; round < 3; round++) {
        const x = ip(2000 + round);
        const emails = Array.from({ length: 30 }, (_, i) => email(`ip-${round}-${i}`));
        const results = await concurrently(30, (i) => attempt(emails[i], x, at(0)));

        expect(allowedCount(results)).toBe(20);
        await expect(bucket(ipKey(x))).resolves.toMatchObject({ count: 20 });
        expect(await existing(emails.map((e) => pairKey(e, x)))).toBe(20);
        expect(await existing(emails.map(emailKey))).toBe(20);
      }
    });

    it("one IP cannot create more than 20 pair (or email) buckets per window", async () => {
      const x = ip(2100);
      const emails = Array.from({ length: 30 }, (_, i) => email(`ip-seq-${i}`));
      const results: Result[] = [];
      for (const e of emails) results.push(await attempt(e, x, at(0)));

      expect(results.slice(0, 20).every((r) => r.allowed)).toBe(true);
      expect(results.slice(20)).toEqual(Array(10).fill({ allowed: false, retryAfterSeconds: 900 }));
      expect(await existing(emails.map((e) => pairKey(e, x)))).toBe(20);
      expect(await existing(emails.map(emailKey))).toBe(20);
    });

    it("allows exactly 50 of 150 IPs x 2 concurrent attempts on one email", async () => {
      const e = email("email-wide");
      const results = await concurrently(300, (i) => attempt(e, ip(3000 + Math.floor(i / 2)), at(0)));

      expect(allowedCount(results)).toBe(50);
      await expect(bucket(emailKey(e))).resolves.toMatchObject({ count: 50 });
    });

    it("allows exactly 50 of 60 concurrent attempts on one email with no IP", async () => {
      const e = email("no-ip-concurrent");
      const results = await concurrently(60, () => attempt(e, null, at(0)));
      expect(allowedCount(results)).toBe(50);
      await expect(bucket(emailKey(e))).resolves.toMatchObject({ count: 50 });
    });
  });

  describe("liveness: one IP's bursts do not lock the email for other IPs (I1)", () => {
    it("20 synchronized bursts of 60 from X: X gets exactly 5, every other IP gets through", async () => {
      const e = email("liveness");
      const x = ip(4000);
      const y = ip(4001);
      const fromX: Result[] = [];
      const fromY: Result[] = [];
      const fromOthers: Result[] = [];

      for (let burst = 0; burst < 20; burst++) {
        const now = at(1 + burst);
        const others: Promise<Result>[] = [attempt(e, ip(4100 + burst), now)]; // inside the burst
        const yInside = burst % 4 === 0 ? [attempt(e, y, now)] : [];
        const xBurst = concurrently(60, () => attempt(e, x, now));
        fromX.push(...(await xBurst));
        fromY.push(...(await Promise.all(yInside)));
        fromOthers.push(...(await Promise.all(others)));
        if (burst % 2 === 1) {
          fromOthers.push(await attempt(e, ip(4200 + burst), now)); // between bursts
        }
      }

      expect(allowedCount(fromX)).toBe(5);
      expect(fromY).toHaveLength(5);
      expect(fromY.every((r) => r.allowed)).toBe(true);
      expect(fromOthers).toHaveLength(30);
      expect(fromOthers.every((r) => r.allowed)).toBe(true);
      // X spent only its pair's 5 slots of the email's 50.
      await expect(bucket(emailKey(e))).resolves.toMatchObject({ count: 5 + 5 + 30 });
      await expect(bucket(ipKey(x))).resolves.toMatchObject({ count: 20 });

      // Y's own pair limit still applies.
      await expect(attempt(e, y, at(30))).resolves.toEqual({ allowed: false, retryAfterSeconds: 900 - 29 });
    });
  });

  describe("fixed window", () => {
    it("is still closed at +899 s and reopens at +900 s", async () => {
      const e = email("window");
      const x = ip(5000);
      for (let i = 0; i < 5; i++) await expect(attempt(e, x, at(0))).resolves.toEqual({ allowed: true });

      await expect(attempt(e, x, at(60))).resolves.toEqual({ allowed: false, retryAfterSeconds: 840 });
      await expect(attempt(e, x, at(899))).resolves.toEqual({ allowed: false, retryAfterSeconds: 1 });
      await expect(attempt(e, x, at(900))).resolves.toEqual({ allowed: true });
      await expect(bucket(pairKey(e, x))).resolves.toMatchObject({ windowStart: at(900), count: 1 });
    });

    it("allows exactly the limit when concurrent attempts arrive exactly at expiry", async () => {
      for (let round = 0; round < 3; round++) {
        const e = email(`expiry-${round}`);
        const x = ip(5100 + round);
        for (let i = 0; i < 5; i++) await attempt(e, x, at(0));

        const results = await concurrently(30, () => attempt(e, x, at(900)));
        expect(allowedCount(results)).toBe(5);
        await expect(bucket(pairKey(e, x))).resolves.toMatchObject({ windowStart: at(900), count: 5 });
      }
    });

    it("allows exactly 50 when 60 attempts with no IP arrive exactly at expiry", async () => {
      const e = email("expiry-no-ip");
      for (let i = 0; i < 50; i++) await attempt(e, null, at(0));
      await expect(attempt(e, null, at(1))).resolves.toMatchObject({ allowed: false });

      const results = await concurrently(60, () => attempt(e, null, at(900)));
      expect(allowedCount(results)).toBe(50);
      await expect(bucket(emailKey(e))).resolves.toMatchObject({ windowStart: at(900), count: 50 });
    });
  });

  describe("no IP", () => {
    it("allows 50 attempts for one email, denies the 51st, and leaves other emails alone", async () => {
      const e = email("no-ip");
      for (let i = 0; i < 50; i++) {
        await expect(attempt(e, null, at(10))).resolves.toEqual({ allowed: true });
      }
      await expect(attempt(e, null, at(20))).resolves.toEqual({ allowed: false, retryAfterSeconds: 890 });
      // the email-wide bucket is shared with attempts that do have an IP
      await expect(attempt(e, ip(6000), at(21))).resolves.toEqual({ allowed: false, retryAfterSeconds: 889 });
      await expect(attempt(email("no-ip-other"), null, at(22))).resolves.toEqual({ allowed: true });
    });
  });

  describe("pruning", () => {
    it("deletes buckets whose window is over and keeps running ones", async () => {
      const old = email("prune-old");
      const running = email("prune-running");
      await attempt(old, null, at(0));
      await attempt(running, null, at(100));

      await attempt(email("prune-trigger"), null, at(950));
      await expect(bucket(emailKey(old))).resolves.toBeNull();
      await expect(bucket(emailKey(running))).resolves.toMatchObject({ count: 1 });
    });
  });

  describe("with authorizeAdmin (real time)", () => {
    let authorize: Isolated<AuthorizeModule>;

    beforeAll(() => {
      const datasourceUrl = withDefaultConnectionLimit(TEST_DATABASE_URL as string, 4);
      authorize = loadIsolated<AuthorizeModule>("@/lib/admin-login/authorize", datasourceUrl);
    });

    afterAll(async () => {
      process.env.VERCEL = savedEnv.VERCEL;
      if (savedEnv.VERCEL === undefined) delete process.env.VERCEL;
      await authorize?.client.$disconnect();
    });

    it("a successful login consumes a slot like any attempt", async () => {
      const adminEmail = email("success");
      const clientIp = ip(7000);
      const secretPassword = `integration-${randomUUID()}`;
      const user = await db.user.create({
        data: { email: adminEmail, name: "Integration Admin", role: "admin" },
      });
      createdUserIds.push(user.id);
      process.env.ADMIN_LOGIN_EMAIL = adminEmail;
      process.env.ADMIN_PASSWORD_HASH = await hashPassword(secretPassword);
      process.env.VERCEL = "1";
      usedKeys.add(ipKey(clientIp)).add(pairKey(adminEmail, clientIp)).add(emailKey(adminEmail));

      const request = () =>
        new Request("https://mate.example.test/api/auth/callback/admin-credentials", {
          method: "POST",
          headers: { "x-real-ip": clientIp },
        });
      const login = (pw: string) =>
        authorize.module.authorizeAdmin({ email: adminEmail, password: pw }, request());

      for (let i = 0; i < 3; i++) await expect(login("wrong-password")).resolves.toBeNull();
      await expect(login(secretPassword)).resolves.toEqual({
        id: user.id,
        email: adminEmail,
        name: "Integration Admin",
      });
      await expect(bucket(pairKey(adminEmail, clientIp))).resolves.toMatchObject({ count: 4 });

      await expect(login(secretPassword)).resolves.not.toBeNull(); // 5th slot
      await expect(login(secretPassword)).resolves.toBeNull(); // the pair is full
      await expect(bucket(pairKey(adminEmail, clientIp))).resolves.toMatchObject({ count: 5 });
    });
  });
});
