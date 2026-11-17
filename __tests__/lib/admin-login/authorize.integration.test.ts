/**
 * @jest-environment node
 *
 * authorizeAdmin against a real, disposable local Postgres: the admin row is
 * found by exact email, never by an ILIKE pattern (`_` / `%` are wildcards).
 * Runs only when ADMIN_LOGIN_TEST_DATABASE_URL is set (see
 * throttle.integration.test.ts). Assertions here do not depend on throttle
 * rows surviving, because the throttle test prunes by its own `now` in
 * parallel.
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

type AuthorizeModule = typeof import("@/lib/admin-login/authorize");

const TEST_DATABASE_URL = process.env.ADMIN_LOGIN_TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;
const suiteTitle = TEST_DATABASE_URL
  ? "authorizeAdmin (integration, disposable Postgres)"
  : "authorizeAdmin (integration) — SKIPPED: set ADMIN_LOGIN_TEST_DATABASE_URL to a disposable local Postgres";

describeWithDb(suiteTitle, () => {
  const SECRET = `authorize-integration-${randomUUID()}`;
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const configured = `probe_a-${runId}@example.com`;
  const decoyEmail = `probeXa-${runId}@example.com`; // matches ILIKE 'probe_a-…', not equality
  const password = `integration-${randomUUID()}`;

  const savedEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    ADMIN_LOGIN_EMAIL: process.env.ADMIN_LOGIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    VERCEL: process.env.VERCEL,
  };

  let loaded: Isolated<AuthorizeModule>;
  let db: PrismaClient;
  const createdUserIds: string[] = [];

  const request = () =>
    new Request("https://mate.example.test/api/auth/callback/admin-credentials", { method: "POST" });
  const login = () => loaded.module.authorizeAdmin({ email: configured, password }, request());

  beforeAll(async () => {
    const url = assertDisposableDatabaseUrl(TEST_DATABASE_URL as string);
    process.env.AUTH_SECRET = SECRET;
    process.env.ADMIN_LOGIN_EMAIL = configured;
    process.env.ADMIN_PASSWORD_HASH = await hashPassword(password);
    delete process.env.VERCEL; // no IP: only the email-wide bucket (50) applies

    loaded = loadIsolated<AuthorizeModule>(
      "@/lib/admin-login/authorize",
      withDefaultConnectionLimit(TEST_DATABASE_URL as string, 4)
    );
    db = loaded.client;
    const [{ db: name }] = await db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(name).toBe(decodeURIComponent(url.pathname.slice(1)));
  });

  afterAll(async () => {
    if (db) {
      if (createdUserIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      const emailKey = createHmac("sha256", SECRET).update(`admin-login:email:${configured}`).digest("hex");
      await db.adminLoginBucket.deleteMany({ where: { key: emailKey } });
      await db.$disconnect();
    }
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("signs in the real admin although a decoy admin row matches the email as an ILIKE pattern", async () => {
    // Created first, so an unordered pattern lookup would tend to return it.
    const decoy = await db.user.create({ data: { email: decoyEmail, name: "Decoy", role: "admin" } });
    createdUserIds.push(decoy.id);
    const real = await db.user.create({ data: { email: configured, name: "Real", role: "admin" } });
    createdUserIds.push(real.id);

    // Precondition: this Postgres really treats `_` as a wildcard here.
    const patternMatches = await db.user.findMany({
      where: { email: { equals: configured, mode: "insensitive" }, role: "admin" },
      select: { id: true },
    });
    expect(patternMatches.map((u) => u.id).sort()).toEqual([decoy.id, real.id].sort());

    await expect(login()).resolves.toEqual({ id: real.id, email: configured, name: "Real" });
  });

  it("rejects when only the decoy row is left", async () => {
    const realId = createdUserIds[1];
    await db.user.delete({ where: { id: realId } });
    createdUserIds.splice(1, 1);

    await expect(login()).resolves.toBeNull();
  });
});
