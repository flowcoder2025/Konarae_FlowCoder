/*
 * Compare exact per-table row counts (schema public) between two Postgres databases.
 *
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/db/compare-row-counts.ts --source-env DIRECT_URL --target-env OCI_DATABASE_URL \
 *     [--exclude document_embeddings,other_table]
 *
 * - Connection URLs are read from the NAMED environment variables and are never printed;
 *   connection errors are reported as a sanitized one-line message.
 * - Exit codes: 0 all equal, 1 at least one mismatch, 2 usage or connection/query error, or
 *   source and target being the SAME database (a database compared with itself always
 *   "matches"; e.g. after .env.local was repointed to OCI). Identity is established by query:
 *   pg_control_system().system_identifier + the oid of current_database() on both connections
 *   (so db.jerome87.com:6432, 127.0.0.1:5433 and flowmate-db:5432 are recognised as one db, and
 *   two databases behind one shared pooler hostname are not confused). The URL comparison is
 *   only a cheap pre-check.
 * - The SQL is shared with deploy/oci/db/row-counts.sql (also used by backup.sh and
 *   verify-restore.sh on the OCI host).
 */
import { promises as dnsPromises } from "dns";
import { readFileSync } from "fs";
import path from "path";

export type RowCountRow = { table: string; source: number; target: number };
export type RowCountReader = (url: string) => Promise<Map<string, number>>;
export type CompareOptions = { exclude: string[] };
export type CliOptions = {
  sourceEnv: string;
  targetEnv: string;
  sourceUrl: string;
  targetUrl: string;
  exclude: string[];
};

/** Reported for a table that exists on only one side. */
export const MISSING = -1;

export const ROW_COUNTS_SQL_PATH = path.resolve(__dirname, "../../deploy/oci/db/row-counts.sql");

export class UsageError extends Error {}

export class RowCountReadError extends Error {
  constructor(
    readonly side: "source" | "target",
    readonly cause: unknown,
  ) {
    super(`failed to read row counts from ${side}`);
  }
}

/** Code-unit order, same as ORDER BY ... COLLATE "C" in row-counts.sql. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Pure merge: every table from either side, excluded tables dropped, sorted by name. */
export function mergeRowCounts(
  source: ReadonlyMap<string, number>,
  target: ReadonlyMap<string, number>,
  exclude: readonly string[] = [],
): RowCountRow[] {
  const excluded = new Set(exclude);
  const tables = new Set<string>([...source.keys(), ...target.keys()]);
  return [...tables]
    .filter((table) => !excluded.has(table))
    .sort(byCodeUnit)
    .map((table) => ({
      table,
      source: source.get(table) ?? MISSING,
      target: target.get(table) ?? MISSING,
    }));
}

export function findMismatches(rows: readonly RowCountRow[]): RowCountRow[] {
  return rows.filter((row) => row.source !== row.target);
}

/**
 * Rows as returned by row-counts.sql (row_count is text to avoid BigInt). Counts must be
 * non-negative integer literals: null/""/"1e3" are rejected before Number() could turn
 * them into 0 or 1000.
 */
export function parseRowCountRows(rows: ReadonlyArray<{ table_name: unknown; row_count: unknown }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const table = row.table_name;
    const raw = row.row_count;
    const text = typeof raw === "bigint" || (typeof raw === "number" && Number.isInteger(raw)) ? String(raw) : raw;
    if (typeof table !== "string" || table === "" || typeof text !== "string" || !/^[0-9]+$/.test(text)) {
      throw new Error("row-counts.sql returned an unexpected row");
    }
    const count = Number(text);
    if (!Number.isSafeInteger(count)) throw new Error("row-counts.sql returned an unexpected row");
    counts.set(table, count);
  }
  return counts;
}

export function loadRowCountsSql(file: string = ROW_COUNTS_SQL_PATH): string {
  return readFileSync(file, "utf8").trim().replace(/;\s*$/, "");
}

/** Default reader: Prisma raw query (no extra pg dependency). Imported lazily so tests never load Prisma. */
export async function readRowCountsWithPrisma(url: string): Promise<Map<string, number>> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url, errorFormat: "minimal", log: [] });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; row_count: string }>>(loadRowCountsSql());
    return parseRowCountRows(rows);
  } finally {
    await prisma.$disconnect();
  }
}

export async function compareRowCounts(
  sourceUrl: string,
  targetUrl: string,
  opts: CompareOptions,
  readCounts: RowCountReader = readRowCountsWithPrisma,
): Promise<RowCountRow[]> {
  let source: Map<string, number>;
  let target: Map<string, number>;
  try {
    source = await readCounts(sourceUrl);
  } catch (err) {
    throw new RowCountReadError("source", err);
  }
  try {
    target = await readCounts(targetUrl);
  } catch (err) {
    throw new RowCountReadError("target", err);
  }
  return mergeRowCounts(source, target, opts.exclude);
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export const USAGE =
  "usage: tsx scripts/db/compare-row-counts.ts --source-env <ENV_NAME> --target-env <ENV_NAME> [--exclude a,b]";

/**
 * Parses CLI args. Error messages never echo argument or environment VALUES (an argument
 * might be a URL pasted by mistake); only validated env NAMES are mentioned.
 */
export function parseCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions {
  const values: Record<"--source-env" | "--target-env" | "--exclude", string | undefined> = {
    "--source-env": undefined,
    "--target-env": undefined,
    "--exclude": undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const key = (eq === -1 ? arg : arg.slice(0, eq)) as keyof typeof values;
    if (!(key in values)) throw new UsageError(`unknown argument at position ${i + 1}`);
    let value: string | undefined;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      value = argv[i + 1];
      i++;
    }
    if (value === undefined || value === "") throw new UsageError(`${key} needs a value`);
    values[key] = value;
  }

  const envName = (flag: "--source-env" | "--target-env") => {
    const name = values[flag];
    if (name === undefined) throw new UsageError(`${flag} is required`);
    if (!ENV_NAME.test(name)) throw new UsageError(`${flag} must be an environment variable NAME ([A-Za-z_][A-Za-z0-9_]*)`);
    return name;
  };
  const sourceEnv = envName("--source-env");
  const targetEnv = envName("--target-env");

  const urlFrom = (name: string) => {
    const url = env[name];
    if (url === undefined || url.trim() === "") throw new UsageError(`environment variable ${name} is not set or empty`);
    return url;
  };
  const sourceUrl = urlFrom(sourceEnv);
  const targetUrl = urlFrom(targetEnv);

  const exclude = (values["--exclude"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (exclude.some((t) => !TABLE_NAME.test(t))) throw new UsageError("--exclude takes comma-separated table names");

  return { sourceEnv, targetEnv, sourceUrl, targetUrl, exclude };
}

function secretVariants(url: string): string[] {
  const variants = [url];
  try {
    const parsed = new URL(url);
    if (parsed.password) variants.push(parsed.password, decodeURIComponent(parsed.password));
  } catch {
    // not a URL: the raw value is still redacted
  }
  return variants.filter((v) => v.length >= 4);
}

/** One-line error text with URLs, passwords and the given secret values removed. */
export function sanitizeErrorMessage(err: unknown, secrets: readonly string[]): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  let msg = err instanceof Error ? err.message : String(err);
  for (const secret of secrets.flatMap(secretVariants).sort((a, b) => b.length - a.length)) {
    msg = msg.split(secret).join("***");
  }
  msg = msg
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`]+/gi, "<redacted-url>")
    .replace(/password\s*=\s*\S+/gi, "password=***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return code && code !== "undefined" ? `${code}: ${msg}` : msg;
}

export function formatRowCountTable(rows: readonly RowCountRow[]): string {
  const show = (n: number) => (n === MISSING ? "missing" : String(n));
  const status = (r: RowCountRow) => (r.source === r.target ? "ok" : "MISMATCH");
  const header = ["table", "source", "target", "status"];
  const body = rows.map((r) => [r.table, show(r.source), show(r.target), status(r)]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cols) => cols[i].length)));
  const line = (cols: string[]) =>
    cols.map((c, i) => (i === 1 || i === 2 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ").trimEnd();
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

export type DatabaseTarget = { host: string; port: string; database: string };
export type HostLookup = (host: string) => Promise<string[]>;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"]);

/** host (lower-case, loopback folded), port (default 5432), database (default: user, like libpq). */
export function databaseTarget(url: string): DatabaseTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const rawHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const host = LOOPBACK.has(rawHost) ? "localhost" : rawHost;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || decodeURIComponent(parsed.username);
  return { host, port: parsed.port || "5432", database };
}

/** Same host:port/database by URL alone (passwords, users and query params are ignored). */
export function sameDatabaseTarget(a: string, b: string): boolean {
  const x = databaseTarget(a);
  const y = databaseTarget(b);
  return !!x && !!y && x.host === y.host && x.port === y.port && x.database === y.database;
}

const defaultLookup: HostLookup = async (host) =>
  (await dnsPromises.lookup(host, { all: true })).map((r) => r.address);

/** Like sameDatabaseTarget, but two different host names that resolve to a shared address also count. */
export async function resolvesToSameTarget(a: string, b: string, lookup: HostLookup = defaultLookup): Promise<boolean> {
  if (sameDatabaseTarget(a, b)) return true;
  const x = databaseTarget(a);
  const y = databaseTarget(b);
  if (!x || !y || x.port !== y.port || x.database !== y.database) return false;
  const resolve = async (host: string) =>
    host === "localhost" ? ["127.0.0.1", "::1"] : await lookup(host).catch(() => [] as string[]);
  const [ax, ay] = await Promise.all([resolve(x.host), resolve(y.host)]);
  return ax.some((addr) => ay.includes(addr));
}

/** Who a connection really talks to. */
export type DbIdentity = { systemIdentifier: string; databaseOid: string; method: "control" | "fallback" };
export type IdentityReader = (url: string) => Promise<DbIdentity>;

const IDENTITY_SQL =
  "SELECT (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS sysid, " +
  "(SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()) AS dboid";
// Fallback if pg_control_system() is not executable (it is for flowmate_app / flowmate_owner on
// OCI and for Supabase's postgres role, checked 2026-11-02). Residual risk: two clusters started
// in the same second, on the same server address/port and version, would look identical.
const IDENTITY_FALLBACK_SQL =
  "SELECT pg_catalog.pg_postmaster_start_time()::text || '|' || coalesce(host(inet_server_addr()), 'local') || ':' || " +
  "coalesce(inet_server_port()::text, '') || '|' || version() AS sysid, " +
  "(SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()) AS dboid";

export async function readIdentityWithPrisma(url: string): Promise<DbIdentity> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url, errorFormat: "minimal", log: [] });
  try {
    try {
      const [row] = await prisma.$queryRawUnsafe<Array<{ sysid: string; dboid: string }>>(IDENTITY_SQL);
      return { systemIdentifier: String(row.sysid), databaseOid: String(row.dboid), method: "control" };
    } catch {
      const [row] = await prisma.$queryRawUnsafe<Array<{ sysid: string; dboid: string }>>(IDENTITY_FALLBACK_SQL);
      return { systemIdentifier: String(row.sysid), databaseOid: String(row.dboid), method: "fallback" };
    }
  } finally {
    await prisma.$disconnect();
  }
}

export function sameIdentity(a: DbIdentity, b: DbIdentity): boolean {
  return a.method === b.method && a.systemIdentifier === b.systemIdentifier && a.databaseOid === b.databaseOid;
}

export type MainDeps = { lookup: HostLookup; readIdentity: IdentityReader; readCounts: RowCountReader };

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  deps: Partial<MainDeps> = {},
): Promise<number> {
  const lookup = deps.lookup ?? defaultLookup;
  const readIdentity = deps.readIdentity ?? readIdentityWithPrisma;
  const readCounts = deps.readCounts ?? readRowCountsWithPrisma;
  let opts: CliOptions;
  try {
    opts = parseCliArgs(argv, env);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\n${USAGE}`);
      return 2;
    }
    throw err;
  }

  if (await resolvesToSameTarget(opts.sourceUrl, opts.targetUrl, lookup)) {
    console.error(
      `error: ${opts.sourceEnv} and ${opts.targetEnv} resolve to the same host:port/database; ` +
        "refusing to compare a database with itself",
    );
    return 2;
  }

  const secrets = [opts.sourceUrl, opts.targetUrl];
  let ids: [DbIdentity, DbIdentity];
  try {
    ids = [await readIdentity(opts.sourceUrl), await readIdentity(opts.targetUrl)];
  } catch (err) {
    console.error(`error: could not identify the databases: ${sanitizeErrorMessage(err, secrets)}`);
    return 2;
  }
  if (sameIdentity(ids[0], ids[1])) {
    console.error(
      `error: ${opts.sourceEnv} and ${opts.targetEnv} are the same database (same system identifier and ` +
        "database oid); refusing to compare a database with itself",
    );
    return 2;
  }

  let rows: RowCountRow[];
  try {
    rows = await compareRowCounts(opts.sourceUrl, opts.targetUrl, { exclude: opts.exclude }, readCounts);
  } catch (err) {
    if (err instanceof RowCountReadError) {
      const name = err.side === "source" ? opts.sourceEnv : opts.targetEnv;
      console.error(`error: ${err.side} (${name}): ${sanitizeErrorMessage(err.cause, secrets)}`);
    } else {
      console.error(`error: ${sanitizeErrorMessage(err, secrets)}`);
    }
    return 2;
  }

  const mismatches = findMismatches(rows);
  console.log(formatRowCountTable(rows));
  console.log(
    `\n${rows.length} tables compared (source=${opts.sourceEnv}, target=${opts.targetEnv}` +
      `${opts.exclude.length ? `, excluded: ${opts.exclude.join(",")}` : ""}): ${mismatches.length} mismatch(es)`,
  );
  return mismatches.length === 0 ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`error: ${sanitizeErrorMessage(err, [])}`);
      process.exitCode = 2;
    },
  );
}
