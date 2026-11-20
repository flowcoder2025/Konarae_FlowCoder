/**
 * Helpers for the admin-login integration tests that run against a real,
 * disposable local Postgres (ADMIN_LOGIN_TEST_DATABASE_URL). Not a test file.
 */

import type { PrismaClient } from "@prisma/client";
import { isCi } from "../../ci-env";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const FORBIDDEN_PORT = "5433";

/**
 * ADMIN_LOGIN_TEST_DATABASE_URL, or undefined to skip the DB suites locally.
 * In CI a missing URL throws: a skipped suite would pass the check silently.
 */
export function testDatabaseUrl(): string | undefined {
  const raw = process.env.ADMIN_LOGIN_TEST_DATABASE_URL;
  if (!raw && isCi()) {
    throw new Error("CI is set but ADMIN_LOGIN_TEST_DATABASE_URL is not: the DB integration suites must run in CI");
  }
  return raw;
}

/** Throws unless the URL is a postgres URL on loopback, not on the production tunnel port. */
export function assertDisposableDatabaseUrl(raw: string): URL {
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

/**
 * Bounds each client's pool when the URL does not (several clients share one
 * server's max_connections). A URL that sets connection_limit, e.g. the
 * PgBouncer run with connection_limit=1 like production, is kept as is.
 */
export function withDefaultConnectionLimit(raw: string, limit: number): string {
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(limit));
  }
  return url.toString();
}

export interface Isolated<T> {
  module: T;
  client: PrismaClient;
  /** SQL text of every query this client ran, in order. */
  queries: string[];
}

/**
 * Loads `modulePath` in its own module registry, with `@/lib/prisma`
 * resolving to a new PrismaClient for `datasourceUrl` that records its
 * queries. Each instance stands for one server process (one Vercel function
 * instance) with its own connection pool.
 */
export function loadIsolated<T>(modulePath: string, datasourceUrl: string): Isolated<T> {
  const global = globalThis as { prisma?: unknown };
  const saved = global.prisma;
  let loaded: Isolated<T> | undefined;

  jest.isolateModules(() => {
    // Created inside the registry so Prisma error classes match the module's.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: IsolatedPrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
    const client = new IsolatedPrismaClient({
      datasourceUrl,
      log: [{ emit: "event", level: "query" }],
    });
    const queries: string[] = [];
    client.$on("query", (event) => {
      queries.push(event.query);
    });
    // src/lib/prisma.ts reuses globalThis.prisma when it is set.
    global.prisma = client;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(modulePath) as T;
    loaded = { module: mod, client: client as unknown as PrismaClient, queries };
  });

  if (saved === undefined) delete global.prisma;
  else global.prisma = saved;
  if (!loaded) throw new Error(`failed to load ${modulePath}`);
  return loaded;
}
