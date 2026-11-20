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
 * Every test uses its own emails, IPs and (future) windows. Pruning is global
 * and follows the `now` passed in: these future windows prune rows of the
 * current real window, which the authorize integration test (running in
 * parallel) does not depend on; its real-time pruning never reaches them.
 */

import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/admin-login/password";
import {
  assertDisposableDatabaseUrl,
  loadIsolated,
  testDatabaseUrl,
  withDefaultConnectionLimit,
  type Isolated,
} from "./disposable-db";

type ThrottleModule = typeof import("@/lib/admin-login/throttle");
type AuthorizeModule = typeof import("@/lib/admin-login/authorize");
type Result = Awaited<ReturnType<ThrottleModule["consumeAttempt"]>>;

const TEST_DATABASE_URL = testDatabaseUrl();
const W = 15 * 60 * 1000;

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
  /** First test window: two windows ahead of the real clock. */
  const K = Math.floor(Date.now() / W) + 2;
  /** A time `ms` into test window `w` (absolute window K + w). */
  const t = (w: number, ms: number) => new Date((K + w) * W + ms);
  const windowOf = (now: Date) => Math.floor(now.getTime() / W);

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
  /** Keys for an absolute window index. */
  const ipKey = (ip: string, window: number) => hmac(`ip:${ip}\n${window}`);
  const pairKey = (email: string, ip: string, window: number) => hmac(`pair:${email}\n${ip}\n${window}`);
  const emailKey = (email: string, window: number) => hmac(`email:${email}\n${window}`);

  const email = (label: string) => `admin-${runId}-${label}@example.com`;
  // IPv6 documentation prefix, unique per run
  const ip = (n: number) => `2001:db8:${runId.slice(0, 4)}:${runId.slice(4)}::${n.toString(16)}`;

  const track = (e: string, i: string | null, window: number) => {
    usedKeys.add(emailKey(e, window));
    if (i) usedKeys.add(ipKey(i, window)).add(pairKey(e, i, window));
  };

  let next = 0;
  /** One attempt on the next client instance (round robin). */
  const attempt = (e: string, i: string | null, now: Date): Promise<Result> => {
    track(e, i, windowOf(now));
    const instance = instances[next++ % instances.length];
    return instance.module.consumeAttempt({ email: e, ip: i, now });
  };
  const concurrently = (n: number, make: (index: number) => Promise<Result>) =>
    Promise.all(Array.from({ length: n }, (_, index) => make(index)));
  const allowedCount = (results: Result[]) => results.filter((r) => r.allowed).length;
  const count = async (key: string) =>
    (await db.adminLoginBucket.findUnique({ where: { key } }))?.count ?? null;
  const existing = (keys: string[]) => db.adminLoginBucket.count({ where: { key: { in: keys } } });

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

  describe("SQL per bucket (Prisma query log)", () => {
    const DATA = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
    // With pgbouncer=true Prisma wraps every statement in BEGIN / DEALLOCATE
    // ALL / ... / COMMIT. Nothing else may appear.
    const CONTROL = new Set(["BEGIN", "COMMIT", "DEALLOCATE"]);
    const kind = (query: string) => query.trim().split(/\s+/)[0].toUpperCase();
    const IP_READ =
      /^SELECT .*"public"\."admin_login_buckets"\."count".* FROM "public"\."admin_login_buckets" WHERE /;
    const UPSERT =
      /^INSERT INTO "public"\."admin_login_buckets" \("key","windowStart","count"\) VALUES \(\$1,\$2,\$3\) ON CONFLICT \("key"\) DO UPDATE SET "count" = \("public"\."admin_login_buckets"\."count" \+ \$4\) WHERE .* RETURNING .*"public"\."admin_login_buckets"\."count"$/;

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

    /** Queries of one consumeAttempt call on instance 0. */
    async function logged(e: string, i: string | null, now: Date): Promise<{ result: Result; queries: string[] }> {
      const instance = instances[0];
      track(e, i, windowOf(now));
      await new Promise((resolve) => setImmediate(resolve));
      instance.queries.length = 0;
      const result = await instance.module.consumeAttempt({ email: e, ip: i, now });
      await new Promise((resolve) => setImmediate(resolve));
      return { result, queries: [...instance.queries] };
    }

    it("each bucket is one native upsert (the IP one after a read), and a new bucket costs exactly what an existing one does", async () => {
      const e = email("sql");
      const x = ip(1);

      const fresh = await logged(e, x, t(0, 1000));
      expect(fresh.result).toEqual({ allowed: true });
      expect(dataStatements(fresh.queries)).toEqual(["SELECT", "INSERT", "INSERT", "INSERT", "DELETE"]);
      expect(fresh.queries.find((q) => kind(q) === "SELECT")).toMatch(IP_READ);
      const upserts = fresh.queries.filter((q) => kind(q) === "INSERT");
      for (const upsert of upserts) expect(upsert).toMatch(UPSERT);
      expect(fresh.queries.find((q) => kind(q) === "DELETE")).toMatch(
        /^DELETE FROM "public"\."admin_login_buckets" WHERE "public"\."admin_login_buckets"\."windowStart" < \$1$/
      );

      // All three buckets now exist: the very same statements, in the same order.
      const again = await logged(e, x, t(0, 2000));
      expect(again.result).toEqual({ allowed: true });
      expect(again.queries).toEqual(fresh.queries);
      expect(await count(pairKey(e, x, K))).toBe(2);
    });

    it("the statement count varies only with the stage that denies", async () => {
      const x = ip(2);
      const noIp = await logged(email("sql-no-ip"), null, t(0, 1000));
      expect(dataStatements(noIp.queries)).toEqual(["INSERT", "DELETE"]);

      // fill X's IP bucket (20), then one more is denied at the IP stage
      const emails = Array.from({ length: 20 }, (_, i) => email(`sql-ip-${i}`));
      for (const e of emails) await attempt(e, x, t(0, 1000));
      const atIp = await logged(email("sql-ip-21"), x, t(0, 1000));
      expect(atIp.result).toEqual({ allowed: false, retryAfterSeconds: 899 });
      // a full IP bucket is only read, never written
      expect(dataStatements(atIp.queries)).toEqual(["SELECT", "DELETE"]);

      // a full pair: denied at the second stage
      const y = ip(3);
      const e = email("sql-pair");
      for (let i = 0; i < 5; i++) await attempt(e, y, t(0, 1000));
      const atPair = await logged(e, y, t(0, 1000));
      expect(atPair.result).toMatchObject({ allowed: false });
      expect(dataStatements(atPair.queries)).toEqual(["SELECT", "INSERT", "INSERT", "DELETE"]);
    });
  });

  describe("a full IP bucket is not written (hot-row flood)", () => {
    it("after an IP is full, its further attempts leave its row, and every pair and email row, unchanged", async () => {
      const x = ip(2200);
      for (let i = 0; i < 20; i++) {
        await expect(attempt(email(`flood-fill-${i}`), x, t(0, 5000))).resolves.toEqual({ allowed: true });
      }
      expect(await count(ipKey(x, K))).toBe(20);

      // sequential, then a concurrent flood from all instances
      const late = Array.from({ length: 10 }, (_, i) => email(`flood-late-${i}`));
      for (const e of late) {
        await expect(attempt(e, x, t(0, 6000))).resolves.toEqual({ allowed: false, retryAfterSeconds: 894 });
      }
      const flood = await concurrently(80, (i) => attempt(late[i % late.length], x, t(0, 7000)));
      expect(allowedCount(flood)).toBe(0);

      expect(await count(ipKey(x, K))).toBe(20);
      expect(await existing(late.map((e) => pairKey(e, x, K)))).toBe(0);
      expect(await existing(late.map((e) => emailKey(e, K)))).toBe(0);
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
        const results = await concurrently(n, () => attempt(e, x, t(0, 5000)));

        expect(allowedCount(results)).toBe(5);
        // Below the IP limit every attempt counts there. Past it, an attempt that
        // reads a full row is not written, so the row ends between 20 and n.
        // Only the IP's 20 reach the pair; only the pair's 5 reach the email.
        const atIp = await count(ipKey(x, K));
        expect(atIp).toBeGreaterThanOrEqual(Math.min(n, 20));
        expect(atIp).toBeLessThanOrEqual(n);
        if (n <= 20) expect(atIp).toBe(n);
        expect(await count(pairKey(e, x, K))).toBe(Math.min(n, 20));
        expect(await count(emailKey(e, K))).toBe(5);
      }
    });

    it("allows exactly 20 of 30 concurrent attempts from one IP over 30 emails (3 rounds)", async () => {
      for (let round = 0; round < 3; round++) {
        const x = ip(2000 + round);
        const emails = Array.from({ length: 30 }, (_, i) => email(`ip-${round}-${i}`));
        const results = await concurrently(30, (i) => attempt(emails[i], x, t(0, 5000)));

        expect(allowedCount(results)).toBe(20);
        const atIp = await count(ipKey(x, K));
        expect(atIp).toBeGreaterThanOrEqual(20);
        expect(atIp).toBeLessThanOrEqual(30);
        expect(await existing(emails.map((e) => pairKey(e, x, K)))).toBe(20);
        expect(await existing(emails.map((e) => emailKey(e, K)))).toBe(20);
      }
    });

    it("one IP cannot create more than 20 pair (or email) buckets per window", async () => {
      const x = ip(2100);
      const emails = Array.from({ length: 30 }, (_, i) => email(`ip-seq-${i}`));
      const results: Result[] = [];
      for (const e of emails) results.push(await attempt(e, x, t(0, 5000)));

      expect(results.slice(0, 20).every((r) => r.allowed)).toBe(true);
      expect(results.slice(20)).toEqual(Array(10).fill({ allowed: false, retryAfterSeconds: 895 }));
      expect(await count(ipKey(x, K))).toBe(20);
      expect(await existing(emails.map((e) => pairKey(e, x, K)))).toBe(20);
      expect(await existing(emails.map((e) => emailKey(e, K)))).toBe(20);
    });

    it("allows exactly 50 of 150 IPs x 2 concurrent attempts on one email", async () => {
      const e = email("email-wide");
      const results = await concurrently(300, (i) => attempt(e, ip(3000 + Math.floor(i / 2)), t(0, 5000)));

      expect(allowedCount(results)).toBe(50);
      expect(await count(emailKey(e, K))).toBe(300);
    });

    it("allows exactly 50 of 60 concurrent attempts on one email with no IP", async () => {
      const e = email("no-ip-concurrent");
      const results = await concurrently(60, () => attempt(e, null, t(0, 5000)));
      expect(allowedCount(results)).toBe(50);
      expect(await count(emailKey(e, K))).toBe(60);
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
        const now = t(0, 10_000 + burst * 1000);
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
      expect(await count(emailKey(e, K))).toBe(5 + 5 + 30);
      expect(await count(pairKey(e, x, K))).toBe(20);
      // Only the first burst writes X's IP row; once it is full the rest only read it.
      const atIp = await count(ipKey(x, K));
      expect(atIp).toBeGreaterThanOrEqual(20);
      expect(atIp).toBeLessThanOrEqual(60);

      // Y's own pair limit still applies.
      await expect(attempt(e, y, t(0, 60_000))).resolves.toEqual({ allowed: false, retryAfterSeconds: 840 });
    });
  });

  describe("fixed epoch windows", () => {
    it("denies in the last millisecond of a window and allows in the first of the next", async () => {
      const e = email("window");
      const x = ip(5000);
      for (let i = 0; i < 5; i++) await expect(attempt(e, x, t(1, 0))).resolves.toEqual({ allowed: true });

      await expect(attempt(e, x, t(1, 60_000))).resolves.toEqual({ allowed: false, retryAfterSeconds: 840 });
      await expect(attempt(e, x, t(1, W - 1))).resolves.toEqual({ allowed: false, retryAfterSeconds: 1 });
      await expect(attempt(e, x, t(2, 0))).resolves.toEqual({ allowed: true });
      expect(await count(pairKey(e, x, K + 2))).toBe(1);
      await expect(db.adminLoginBucket.findUnique({ where: { key: pairKey(e, x, K + 2) } })).resolves.toMatchObject({
        windowStart: t(2, 0),
      });
    });

    it("allows exactly the limit in each window when concurrent attempts straddle a boundary (3 rounds)", async () => {
      for (let round = 0; round < 3; round++) {
        const before = 3 + round * 2;
        const e = email(`straddle-${round}`);
        const x = ip(5100 + round);
        // 30 + 30 interleaved: the last millisecond of one window, the first of the next
        const results = await concurrently(60, (i) => attempt(e, x, i % 2 === 0 ? t(before, W - 1) : t(before + 1, 0)));
        const late = results.filter((_, i) => i % 2 === 0);
        const early = results.filter((_, i) => i % 2 === 1);

        expect(allowedCount(late)).toBe(5);
        expect(allowedCount(early)).toBe(5);
        expect(await count(pairKey(e, x, K + before))).toBe(20);
        expect(await count(pairKey(e, x, K + before + 1))).toBe(20);
      }
    });

    it("allows exactly 50 in each window when attempts with no IP straddle a boundary", async () => {
      const e = email("straddle-no-ip");
      const results = await concurrently(120, (i) => attempt(e, null, i % 2 === 0 ? t(9, W - 1) : t(10, 0)));
      expect(allowedCount(results.filter((_, i) => i % 2 === 0))).toBe(50);
      expect(allowedCount(results.filter((_, i) => i % 2 === 1))).toBe(50);
    });
  });

  describe("no IP", () => {
    it("allows 50 attempts for one email, denies the 51st, and leaves other emails alone", async () => {
      const e = email("no-ip");
      for (let i = 0; i < 50; i++) {
        await expect(attempt(e, null, t(11, 10_000))).resolves.toEqual({ allowed: true });
      }
      await expect(attempt(e, null, t(11, 20_000))).resolves.toEqual({ allowed: false, retryAfterSeconds: 880 });
      // the email-wide bucket is shared with attempts that do have an IP
      await expect(attempt(e, ip(6000), t(11, 21_000))).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 879,
      });
      await expect(attempt(email("no-ip-other"), null, t(11, 22_000))).resolves.toEqual({ allowed: true });
    });
  });

  describe("pruning", () => {
    it("deletes windows before the previous one and keeps the previous and current", async () => {
      const old = email("prune-old");
      const previous = email("prune-previous");
      await attempt(old, null, t(20, 0));
      await attempt(previous, null, t(21, 0));

      await attempt(email("prune-trigger"), null, t(22, 0));
      expect(await count(emailKey(old, K + 20))).toBeNull();
      expect(await count(emailKey(previous, K + 21))).toBe(1);
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
      // Stay inside one real window for the whole test (it takes well under a second).
      const msToBoundary = W - (Date.now() % W);
      if (msToBoundary < 3_000) await new Promise((resolve) => setTimeout(resolve, msToBoundary + 100));
      const window = windowOf(new Date());

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
      track(adminEmail, clientIp, window);

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
      expect(await count(pairKey(adminEmail, clientIp, window))).toBe(4);

      await expect(login(secretPassword)).resolves.not.toBeNull(); // 5th slot
      await expect(login(secretPassword)).resolves.toBeNull(); // the pair is full
      expect(await count(pairKey(adminEmail, clientIp, window))).toBe(6);
      expect(windowOf(new Date())).toBe(window);
    }, 20_000);
  });
});
