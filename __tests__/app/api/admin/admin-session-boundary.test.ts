/**
 * Admin boundary with the real judgement (requireAdmin -> auth-utils). Only the
 * session (`@/lib/auth`) and the database (`@/lib/prisma`) are mocked, plus
 * modules that would otherwise start external clients.
 *
 * A social session is not an admin even when the user row has role=admin: it
 * must get 403 (or the action's forbidden result) without any database call.
 *
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import type { Session } from "next-auth";

const mockPrismaCalls: string[] = [];
let mockPrismaAnswer: (operation: string, args: unknown[]) => unknown = () => {
  throw new Error("unexpected database call");
};

// Records every client call as "model.method" (or "$method").
jest.mock("@/lib/prisma", () => {
  const call =
    (operation: string) =>
    (...args: unknown[]) => {
      mockPrismaCalls.push(operation);
      return mockPrismaAnswer(operation, args);
    };
  const model = (name: string) =>
    new Proxy({}, { get: (_target, method) => call(`${name}.${String(method)}`) });
  return {
    prisma: new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop === "symbol" || prop === "then") return undefined;
          return prop.startsWith("$") ? call(prop) : model(prop);
        },
      }
    ),
  };
});

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

// Imported by admin-actions; would load Playwright and the crawler.
jest.mock("@/lib/crawler/worker", () => ({
  processCrawlJob: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as crawlerStatsGET } from "@/app/api/admin/crawler/stats/route";
import { POST as creditsGrantPOST } from "@/app/api/admin/credits/grant/route";
import { DELETE as duplicateGroupDELETE } from "@/app/api/admin/duplicate-groups/[id]/route";
import { updateUserRole } from "@/lib/actions/admin-actions";

const mockAuth = auth as unknown as jest.Mock;

const SOCIAL_ADMIN: Session = {
  user: { id: "admin-1", email: "admin@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

function passwordAdmin(): Session {
  return { ...SOCIAL_ADMIN, adminAuthAt: Date.now() - 60 * 60 * 1000 };
}

/** The user row says role=admin; everything after the guard fails loudly. */
function answerAsAdminRow(operation: string): unknown {
  if (operation === "user.findUnique") return Promise.resolve({ role: "admin" });
  return Promise.reject(new Error(`stop after guard: ${operation}`));
}

const handlers: Array<{ name: string; run: () => Promise<Response> }> = [
  {
    name: "GET /api/admin/crawler/stats",
    run: () => crawlerStatsGET(new NextRequest("http://localhost/api/admin/crawler/stats")),
  },
  {
    name: "POST /api/admin/credits/grant",
    run: () =>
      creditsGrantPOST(
        new Request("http://localhost/api/admin/credits/grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "target-1", amount: 100, reason: "test" }),
        })
      ),
  },
  {
    name: "DELETE /api/admin/duplicate-groups/[id]",
    run: () =>
      duplicateGroupDELETE(
        new NextRequest("http://localhost/api/admin/duplicate-groups/group-1", { method: "DELETE" }),
        { params: Promise.resolve({ id: "group-1" }) }
      ),
  },
];

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrismaCalls.length = 0;
  mockPrismaAnswer = answerAsAdminRow;
  // Handlers log their caught errors; keep the output clean.
  consoleSpies = (["error", "warn", "info", "log"] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined)
  );
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

describe("social session with role=admin", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(SOCIAL_ADMIN);
  });

  it.each(handlers)("$name answers 403 without touching the database", async ({ run }) => {
    const res = await run();

    expect(res.status).toBe(403);
    expect(mockPrismaCalls).toEqual([]);
  });

  it("the updateUserRole server action is refused without touching the database", async () => {
    await expect(updateUserRole("target-1", "admin")).resolves.toMatchObject({
      success: false,
      error: "관리자 권한이 필요합니다",
    });
    expect(mockPrismaCalls).toEqual([]);
  });
});

describe("no session", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(null);
  });

  it.each(handlers)("$name answers 401 without touching the database", async ({ run }) => {
    const res = await run();

    expect(res.status).toBe(401);
    expect(mockPrismaCalls).toEqual([]);
  });

  it("the updateUserRole server action is refused without touching the database", async () => {
    await expect(updateUserRole("target-1", "admin")).resolves.toMatchObject({
      success: false,
      error: "인증이 필요합니다",
    });
    expect(mockPrismaCalls).toEqual([]);
  });
});

// Controls: the same calls get past the guard for a password admin, so the
// 403s above come from the judgement and not from a broken harness.
describe("password admin (control)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(passwordAdmin());
  });

  it.each(handlers)("$name gets past the guard", async ({ run }) => {
    const res = await run();

    expect([401, 403]).not.toContain(res.status);
    expect(mockPrismaCalls[0]).toBe("user.findUnique");
    expect(mockPrismaCalls.length).toBeGreaterThan(1);
  });

  it("the updateUserRole server action gets past the guard", async () => {
    const result = await updateUserRole("target-1", "user");

    expect(result.success).toBe(false);
    expect(result.error).toBe("stop after guard: user.update");
    expect(mockPrismaCalls).toEqual(["user.findUnique", "user.update"]);
  });

  it("a password admin whose role was revoked is refused", async () => {
    mockPrismaAnswer = (operation) =>
      operation === "user.findUnique" ? Promise.resolve({ role: "user" }) : Promise.reject(new Error("no"));

    for (const { run } of handlers) {
      expect((await run()).status).toBe(403);
    }
    expect(new Set(mockPrismaCalls)).toEqual(new Set(["user.findUnique"]));
  });
});
