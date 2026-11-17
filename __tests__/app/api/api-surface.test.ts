/**
 * The API surface is a fixed list. Every route handler on disk must be in
 * KEEP_ROUTES and every entry must exist on disk, so adding a route means
 * adding it here with a reason, and a deleted legacy route cannot come back
 * unnoticed. Reads the file system only.
 *
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");
const API_DIR = path.join(APP_DIR, "api");
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

const KEEP_ROUTES: readonly string[] = [
  // NextAuth handler (social sign-in, admin password sign-in, session).
  "/api/auth/[...nextauth]",

  // Admin console APIs; every handler starts with requireAdmin()
  // (__tests__/app/api/admin/admin-guard-scan.test.ts).
  "/api/admin/cleanup-duplicates",
  "/api/admin/crawler/jobs",
  "/api/admin/crawler/live-status",
  "/api/admin/crawler/start",
  "/api/admin/crawler/stats",
  "/api/admin/credits/deduct",
  "/api/admin/credits/grant",
  "/api/admin/duplicate-groups",
  "/api/admin/duplicate-groups/[id]",
  "/api/admin/duplicates",
  "/api/admin/matching/export",
  "/api/admin/matching/health",
  "/api/admin/pipeline/embed",
  "/api/admin/pipeline/jobs",
  "/api/admin/pipeline/parse",
  "/api/admin/pipeline/settings",
  "/api/admin/pipeline/stats",
  "/api/admin/repair-filenames",
  "/api/admin/system-status",

  // Scheduled jobs (vercel.json crons, QStash schedules), authenticated by
  // CRON_SECRET or a QStash signature.
  "/api/cron/analyze-projects",
  "/api/cron/close-expired",
  "/api/cron/crawl-all",
  "/api/cron/daily-digest",
  "/api/cron/deadline-alerts",
  "/api/cron/generate-embeddings",
  "/api/cron/matching-refresh",

  // Server-to-server calls, authenticated by INTERNAL_API_KEY (lib/internal-api.ts).
  "/api/internal/pipeline/health",
  "/api/internal/projects/[id]/analyze",
  "/api/internal/projects/[id]/debug",

  // Public read-only board API, rate limited (lib/public-api-rate-limit.ts).
  "/api/v1/categories",
  "/api/v1/projects",
  "/api/v1/projects/[id]",
  "/api/v1/projects/[id]/analysis",
  "/api/v1/regions",
];

const ALLOWED_PREFIXES = ["/api/auth/", "/api/admin/", "/api/cron/", "/api/internal/", "/api/v1/"];

function findFiles(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

/** Repo-relative path with forward slashes. */
const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

/**
 * URL patterns of the given route files (repo-relative, under src/app/api/).
 * Route groups `(x)` are dropped; `[x]`, `[...x]` and `[[...x]]` stay as they are.
 * Files that are not route handlers are ignored.
 */
function discoverRoutes(files: readonly string[] = findFiles(API_DIR, ROUTE_FILE).map(relative)): string[] {
  return files
    .filter((file) => ROUTE_FILE.test(path.posix.basename(file)))
    .map((file) => {
      const segments = path.posix
        .dirname(file)
        .replace(/^src\/app/, "")
        .split("/")
        .filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment));
      return `/${segments.join("/")}`;
    })
    .sort();
}

describe("API surface", () => {
  it("has exactly the routes in KEEP_ROUTES on disk", () => {
    const onDisk = discoverRoutes();
    const keep = new Set(KEEP_ROUTES);
    const disk = new Set(onDisk);

    expect({
      onDiskButNotInKeepRoutes: onDisk.filter((route) => !keep.has(route)),
      inKeepRoutesButNotOnDisk: KEEP_ROUTES.filter((route) => !disk.has(route)).sort(),
    }).toEqual({ onDiskButNotInKeepRoutes: [], inKeepRoutesButNotOnDisk: [] });
    expect(onDisk).toEqual([...KEEP_ROUTES].sort());
  });

  it("keeps every vercel.json cron path in KEEP_ROUTES", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string }>;
    };
    const cronPaths = (vercel.crons ?? []).map((cron) => cron.path);

    expect(cronPaths.length).toBeGreaterThan(0);
    expect(cronPaths.filter((cronPath) => !KEEP_ROUTES.includes(cronPath))).toEqual([]);
  });

  it("keeps only auth, admin, cron, internal and v1 routes", () => {
    expect(KEEP_ROUTES.filter((route) => !ALLOWED_PREFIXES.some((prefix) => route.startsWith(prefix)))).toEqual([]);
  });

  it("has no route handler outside src/app/api", () => {
    const routeFiles = findFiles(APP_DIR, ROUTE_FILE).map(relative);

    expect(routeFiles.length).toBeGreaterThan(0);
    expect(routeFiles.filter((file) => !file.startsWith("src/app/api/"))).toEqual([]);
  });

  it("turns route file paths into URL patterns", () => {
    expect(
      discoverRoutes([
        "src/app/api/route.ts",
        "src/app/api/v1/projects/route.ts",
        "src/app/api/(public)/v1/regions/route.tsx",
        "src/app/api/(a)/(b)/x/route.js",
        "src/app/api/v1/projects/[id]/route.jsx",
        "src/app/api/auth/[...nextauth]/route.mts",
        "src/app/api/docs/[[...slug]]/route.cts",
        "src/app/api/m/route.mjs",
        "src/app/api/c/route.cjs",
        "src/app/api/v1/projects/helpers.ts",
        "src/app/api/v1/projects/route.test.ts",
        "src/app/api/v1/projects/route.d.ts",
      ])
    ).toEqual([
      "/api",
      "/api/auth/[...nextauth]",
      "/api/c",
      "/api/docs/[[...slug]]",
      "/api/m",
      "/api/v1/projects",
      "/api/v1/projects/[id]",
      "/api/v1/regions",
      "/api/x",
    ]);
  });
});
