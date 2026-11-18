/**
 * @jest-environment node
 *
 * Cron routes accept a shared secret only when that secret is configured.
 * Comparing a header with `Bearer ${process.env.CRON_SECRET}` directly accepts
 * the literal header "Bearer undefined" where the variable is missing, so the
 * handlers go through src/lib/cron-auth.ts and never compare against
 * process.env themselves.
 */

import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { hasAdminApiKey, hasCronBearer, hasWorkerKey, matchesSecret } from "@/lib/cron-auth";

// A handler that gets past its auth check must not reach a database, the
// worker, or a mail provider from this test.
jest.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: () => () => Promise.reject(new Error("prisma is not available in this test")) }
        ),
    }
  ),
}));
jest.mock("@/lib/notifications", () => ({
  sendDailyDigestEmail: jest.fn(),
  sendDeadlineAlert: jest.fn(),
  sendCrawlerAlert: jest.fn(),
  sendNotification: jest.fn(),
}));

const CRON_DIR = path.join(process.cwd(), "src", "app", "api", "cron");
const SECRET_ENV = ["CRON_SECRET", "ADMIN_API_KEY", "WORKER_API_KEY"] as const;
// deadline-alerts accepts a QStash signature only.
const SECRET_ROUTES = [
  "analyze-projects",
  "close-expired",
  "crawl-all",
  "daily-digest",
  "generate-embeddings",
  "matching-refresh",
] as const;

type Handler = (req: NextRequest) => Promise<Response>;
type RouteModule = { GET?: Handler; POST?: Handler };

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = jest.fn(() => Promise.reject(new Error("fetch is not available in this test")));
const savedFetch = global.fetch;

function setEnv(values: Partial<Record<(typeof SECRET_ENV)[number], string>>) {
  for (const name of SECRET_ENV) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
}

function request(route: string, method: "GET" | "POST", headers: Record<string, string>) {
  return new NextRequest(`https://mate.flow-coder.com/api/cron/${route}`, {
    method,
    headers,
    ...(method === "POST" ? { body: "{}" } : {}),
  });
}

async function statuses(route: string, headers: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(`@/app/api/cron/${route}/route`) as RouteModule;
  const result: Record<string, number> = {};
  for (const method of ["GET", "POST"] as const) {
    const handler = mod[method];
    if (handler) result[method] = (await handler(request(route, method, headers))).status;
  }
  return result;
}

beforeAll(() => {
  for (const name of SECRET_ENV) savedEnv[name] = process.env[name];
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  for (const name of SECRET_ENV) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  global.fetch = savedFetch;
});

beforeEach(() => {
  setEnv({});
  fetchMock.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("matchesSecret", () => {
  it("accepts the configured value only", () => {
    expect(matchesSecret("s3cret", "s3cret")).toBe(true);
    expect(matchesSecret("s3cret ", "s3cret")).toBe(false);
    expect(matchesSecret("S3CRET", "s3cret")).toBe(false);
    expect(matchesSecret("s3cre", "s3cret")).toBe(false);
    expect(matchesSecret("", "s3cret")).toBe(false);
    expect(matchesSecret(null, "s3cret")).toBe(false);
  });

  it("rejects everything when the secret is missing or empty", () => {
    expect(matchesSecret("undefined", undefined)).toBe(false);
    expect(matchesSecret(null, undefined)).toBe(false);
    expect(matchesSecret("", "")).toBe(false);
    expect(matchesSecret("", undefined)).toBe(false);
  });
});

describe("request checks", () => {
  const req = (headers: Record<string, string>) => request("close-expired", "GET", headers);

  it("accepts exactly the header Vercel Cron sends", () => {
    setEnv({ CRON_SECRET: "cron-value" });

    expect(hasCronBearer(req({ authorization: "Bearer cron-value" }))).toBe(true);
    expect(hasCronBearer(req({ authorization: "bearer cron-value" }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "cron-value" }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "Bearer cron-value-x" }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "Bearer undefined" }))).toBe(false);
    expect(hasCronBearer(req({}))).toBe(false);
  });

  it("rejects the bearer header when CRON_SECRET is missing or empty", () => {
    expect(hasCronBearer(req({ authorization: "Bearer undefined" }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "Bearer " }))).toBe(false);

    setEnv({ CRON_SECRET: "" });
    expect(hasCronBearer(req({ authorization: "Bearer " }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "Bearer" }))).toBe(false);
    expect(hasCronBearer(req({ authorization: "Bearer undefined" }))).toBe(false);
  });

  it("checks x-api-key and x-worker-key against their own secrets", () => {
    setEnv({ ADMIN_API_KEY: "admin-value", WORKER_API_KEY: "worker-value" });

    expect(hasAdminApiKey(req({ "x-api-key": "admin-value" }))).toBe(true);
    expect(hasAdminApiKey(req({ "x-api-key": "worker-value" }))).toBe(false);
    expect(hasWorkerKey(req({ "x-worker-key": "worker-value" }))).toBe(true);
    expect(hasWorkerKey(req({ "x-worker-key": "admin-value" }))).toBe(false);
    expect(hasAdminApiKey(req({}))).toBe(false);
    expect(hasWorkerKey(req({}))).toBe(false);
  });

  it("rejects an empty key header when the key is missing or empty", () => {
    expect(hasAdminApiKey(req({ "x-api-key": "" }))).toBe(false);
    expect(hasAdminApiKey(req({ "x-api-key": "undefined" }))).toBe(false);
    expect(hasWorkerKey(req({ "x-worker-key": "undefined" }))).toBe(false);

    setEnv({ ADMIN_API_KEY: "", WORKER_API_KEY: "" });
    expect(hasAdminApiKey(req({ "x-api-key": "" }))).toBe(false);
    expect(hasWorkerKey(req({ "x-worker-key": "" }))).toBe(false);
  });
});

describe.each(SECRET_ROUTES)("/api/cron/%s", (route) => {
  it("exports a handler", async () => {
    expect(Object.keys(await statuses(route, {})).length).toBeGreaterThan(0);
  });

  it("returns 401 for 'Bearer undefined' when no secret is configured", async () => {
    for (const status of Object.values(await statuses(route, { authorization: "Bearer undefined" }))) {
      expect(status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 for empty or 'undefined' key headers when no secret is configured", async () => {
    const headers = { "x-api-key": "", "x-worker-key": "undefined", authorization: "Bearer " };
    for (const status of Object.values(await statuses(route, headers))) {
      expect(status).toBe(401);
    }

    setEnv({ CRON_SECRET: "", ADMIN_API_KEY: "", WORKER_API_KEY: "" });
    for (const status of Object.values(await statuses(route, { ...headers, "x-worker-key": "" }))) {
      expect(status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong secret and for no credentials", async () => {
    setEnv({ CRON_SECRET: "cron-value", ADMIN_API_KEY: "admin-value", WORKER_API_KEY: "worker-value" });

    const wrong = { authorization: "Bearer cron-valuex", "x-api-key": "admin-valuex", "x-worker-key": "x" };
    for (const status of Object.values(await statuses(route, wrong))) expect(status).toBe(401);
    for (const status of Object.values(await statuses(route, {}))) expect(status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the configured Vercel Cron bearer and the admin key through", async () => {
    setEnv({ CRON_SECRET: "cron-value", ADMIN_API_KEY: "admin-value" });

    for (const status of Object.values(await statuses(route, { authorization: "Bearer cron-value" }))) {
      expect(status).not.toBe(401);
    }
    for (const status of Object.values(await statuses(route, { "x-api-key": "admin-value" }))) {
      expect(status).not.toBe(401);
    }
  });
});

describe("/api/cron/matching-refresh worker key", () => {
  it("lets the configured worker key through and rejects it elsewhere", async () => {
    setEnv({ WORKER_API_KEY: "worker-value" });

    for (const status of Object.values(await statuses("matching-refresh", { "x-worker-key": "worker-value" }))) {
      expect(status).not.toBe(401);
    }
    for (const status of Object.values(await statuses("close-expired", { "x-worker-key": "worker-value" }))) {
      expect(status).toBe(401);
    }
  });
});

describe("cron route sources", () => {
  const routeFiles = fs
    .readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CRON_DIR, entry.name, "route.ts"));

  it("covers every cron route", () => {
    expect(routeFiles.map((file) => path.basename(path.dirname(file))).sort()).toEqual(
      [...SECRET_ROUTES, "deadline-alerts"].sort()
    );
  });

  it("never reads an inbound secret or compares against process.env in a handler", () => {
    const hits = routeFiles.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const patterns = [
        // Inbound secrets belong to cron-auth. WORKER_API_KEY is also sent on
        // outbound worker calls, so only its comparisons are banned (below).
        /process\.env\.(CRON_SECRET|ADMIN_API_KEY)\b/,
        /process\.env\[/,
        /[!=]==?\s*process\.env\b/,
        /process\.env\.[A-Z0-9_]+\s*[!=]==?/,
        // A secret interpolated into a string is how `Bearer ${...}` got compared.
        /\$\{\s*process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN)/,
        /timingSafeEqual/,
      ];
      return patterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path.relative(process.cwd(), file)}: ${pattern}`);
    });

    expect(hits).toEqual([]);
  });

  it("checks credentials through cron-auth in every secret-based route", () => {
    for (const route of SECRET_ROUTES) {
      const source = fs.readFileSync(path.join(CRON_DIR, route, "route.ts"), "utf8");
      expect({ route, usesHelper: /from "@\/lib\/cron-auth"/.test(source) && /hasCronBearer\(req\)/.test(source) }).toEqual({
        route,
        usesHelper: true,
      });
    }
  });
});
