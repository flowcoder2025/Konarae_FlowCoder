/**
 * Access rules of the RAG routes, with the real judgement: ReBAC
 * (`@/lib/rebac`) and the admin check (`@/lib/auth-utils`) run for real; only
 * the session (`@/lib/auth`), the database (`@/lib/prisma`) and the embedding
 * functions (`@/lib/rag`, which would call OpenAI) are mocked.
 *
 * - support_project: public announcements. Any signed-in user reads; only an
 *   admin (password sign-in + role=admin) writes.
 * - company: viewer reads, company admin/owner writes.
 * - business_plan: viewer reads, owner writes.
 * - search: a non-admin only ever searches support_project.
 *
 * A refused request must not reach the embedding functions.
 *
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import type { Session } from "next-auth";

type Tuple = { namespace: string; objectId: string; relation: string; subjectId: string };

const mockPrismaCalls: string[] = [];
let mockTuples: Tuple[] = [];
let mockUserRole: string | null = null;

// Records every client call as "model.method" and answers the two queries the
// access rules make; anything else fails loudly.
jest.mock("@/lib/prisma", () => {
  const answer = (operation: string, args: unknown[]): Promise<unknown> => {
    if (operation === "relationTuple.count") {
      const { where } = args[0] as {
        where: { namespace: string; objectId: string; relation: { in: string[] }; subjectType: string; subjectId: string };
      };
      const count = mockTuples.filter(
        (t) =>
          where.subjectType === "user" &&
          t.namespace === where.namespace &&
          t.objectId === where.objectId &&
          t.subjectId === where.subjectId &&
          where.relation.in.includes(t.relation)
      ).length;
      return Promise.resolve(count);
    }
    if (operation === "user.findUnique") {
      return Promise.resolve(mockUserRole === null ? null : { role: mockUserRole });
    }
    return Promise.reject(new Error(`unexpected database call: ${operation}`));
  };
  const call =
    (operation: string) =>
    (...args: unknown[]) => {
      mockPrismaCalls.push(operation);
      return answer(operation, args);
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

jest.mock("@/lib/rag", () => ({
  storeDocumentEmbeddings: jest.fn(),
  hybridSearch: jest.fn(),
  getEmbeddingCount: jest.fn(),
  deleteEmbeddings: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { storeDocumentEmbeddings, hybridSearch, getEmbeddingCount, deleteEmbeddings } from "@/lib/rag";
import { POST as embedPOST } from "@/app/api/rag/embed/route";
import { POST as searchPOST } from "@/app/api/rag/search/route";
import {
  GET as embeddingsGET,
  DELETE as embeddingsDELETE,
} from "@/app/api/rag/embeddings/[sourceType]/[sourceId]/route";

const mockAuth = auth as unknown as jest.Mock;
const mockStore = storeDocumentEmbeddings as jest.Mock;
const mockSearch = hybridSearch as jest.Mock;
const mockCount = getEmbeddingCount as jest.Mock;
const mockDelete = deleteEmbeddings as jest.Mock;

const USER_ID = "user-1";
const SOURCE_TYPES = ["support_project", "company", "business_plan"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

/** A Kakao/Google session: never an admin, whatever the user row says. */
function socialSession(): Session {
  return { user: { id: USER_ID, email: "user@example.com" }, expires: "2099-01-01T00:00:00.000Z" };
}

/** A session from the admin password sign-in an hour ago. */
function passwordSession(): Session {
  return { ...socialSession(), adminAuthAt: Date.now() - 60 * 60 * 1000 };
}

function grantTuple(namespace: string, objectId: string, relation: string): void {
  mockTuples.push({ namespace, objectId, relation, subjectId: USER_ID });
}

function embed(body: unknown): Promise<Response> {
  return embedPOST(
    new NextRequest("http://localhost/api/rag/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function embedSource(sourceType: SourceType, sourceId = "source-1"): Promise<Response> {
  return embed({ sourceType, sourceId, content: "overwritten text" });
}

function search(body: Record<string, unknown>): Promise<Response> {
  return searchPOST(
    new NextRequest("http://localhost/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function embeddings(method: "GET" | "DELETE", sourceType: string, sourceId = "source-1"): Promise<Response> {
  const handler = method === "GET" ? embeddingsGET : embeddingsDELETE;
  return handler(
    new NextRequest(`http://localhost/api/rag/embeddings/${sourceType}/${sourceId}`, { method }),
    { params: Promise.resolve({ sourceType, sourceId }) }
  );
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrismaCalls.length = 0;
  mockTuples = [];
  mockUserRole = "user";
  mockStore.mockResolvedValue(undefined);
  mockSearch.mockResolvedValue([]);
  mockCount.mockResolvedValue(3);
  mockDelete.mockResolvedValue(undefined);
  consoleSpies = (["error", "warn", "info", "log"] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined)
  );
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

describe("without a session", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(null);
  });

  it.each([
    ["POST /api/rag/embed", () => embedSource("support_project")],
    ["POST /api/rag/search", () => search({ query: "q" })],
    ["GET /api/rag/embeddings", () => embeddings("GET", "company")],
    ["DELETE /api/rag/embeddings", () => embeddings("DELETE", "company")],
  ])("%s answers 401 without touching the database", async (_name, run) => {
    const res = await run();

    expect(res.status).toBe(401);
    expect(mockPrismaCalls).toEqual([]);
  });
});

describe("POST /api/rag/embed", () => {
  it("rejects an invalid body with 400 before any permission check", async () => {
    mockAuth.mockResolvedValue(socialSession());

    const res = await embed({ sourceType: "company", sourceId: "", content: "x" });

    expect(res.status).toBe(400);
    expect(mockPrismaCalls).toEqual([]);
    expect(mockStore).not.toHaveBeenCalled();
  });

  describe("support_project", () => {
    it("refuses a social session with role=admin (403, no database call, nothing stored)", async () => {
      mockAuth.mockResolvedValue(socialSession());
      mockUserRole = "admin";

      const res = await embedSource("support_project");

      expect(res.status).toBe(403);
      expect(mockPrismaCalls).toEqual([]);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("refuses a password sign-in whose user is no longer an admin", async () => {
      mockAuth.mockResolvedValue(passwordSession());
      mockUserRole = "user";

      const res = await embedSource("support_project");

      expect(res.status).toBe(403);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("stores for an admin", async () => {
      mockAuth.mockResolvedValue(passwordSession());
      mockUserRole = "admin";

      const res = await embedSource("support_project", "project-9");

      expect(res.status).toBe(200);
      expect(mockStore).toHaveBeenCalledWith("support_project", "project-9", "overwritten text", {});
    });
  });

  describe.each([
    {
      sourceType: "company" as const,
      refused: [[], ["viewer"], ["member"]],
      allowed: [["admin"], ["owner"]],
    },
    {
      sourceType: "business_plan" as const,
      refused: [[], ["viewer"], ["editor"]],
      allowed: [["owner"]],
    },
  ])("$sourceType", ({ sourceType, refused, allowed }) => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(socialSession());
    });

    const refusedRows = refused.map((relations) => ({ relations, label: relations.join("+") || "none" }));

    it.each(refusedRows)("refuses a user with relations $label (403, nothing stored)", async ({ relations }) => {
      relations.forEach((relation) => grantTuple(sourceType, "source-1", relation));

      const res = await embedSource(sourceType);

      expect(res.status).toBe(403);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("refuses a relation on a different object", async () => {
      allowed.flat().forEach((relation) => grantTuple(sourceType, "other-source", relation));

      const res = await embedSource(sourceType);

      expect(res.status).toBe(403);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("refuses an admin session without the relation", async () => {
      mockAuth.mockResolvedValue(passwordSession());
      mockUserRole = "admin";

      const res = await embedSource(sourceType);

      expect(res.status).toBe(403);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it.each(allowed.flat())("stores for a user with relation %s", async (relation) => {
      grantTuple(sourceType, "source-1", relation);

      const res = await embedSource(sourceType);

      expect(res.status).toBe(200);
      expect(mockStore).toHaveBeenCalledWith(sourceType, "source-1", "overwritten text", {});
    });
  });
});

describe("GET /api/rag/embeddings/:sourceType/:sourceId", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(socialSession());
  });

  it("returns the count of a support project to any signed-in user", async () => {
    const res = await embeddings("GET", "support_project");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ embeddingCount: 3 });
    expect(mockPrismaCalls).toEqual([]);
  });

  it.each(["company", "business_plan"])("refuses %s without a relation (403, no count)", async (sourceType) => {
    const res = await embeddings("GET", sourceType);

    expect(res.status).toBe(403);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it.each(["company", "business_plan"])("returns the count of %s to a viewer", async (sourceType) => {
    grantTuple(sourceType, "source-1", "viewer");

    const res = await embeddings("GET", sourceType);

    expect(res.status).toBe(200);
    expect(mockCount).toHaveBeenCalledWith(sourceType, "source-1");
  });

  it("rejects an unknown source type with 400", async () => {
    const res = await embeddings("GET", "matching_result");

    expect(res.status).toBe(400);
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/rag/embeddings/:sourceType/:sourceId", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(socialSession());
  });

  it.each([
    ["company", "member"],
    ["business_plan", "editor"],
  ])("refuses %s with relation %s (403, nothing deleted)", async (sourceType, relation) => {
    grantTuple(sourceType, "source-1", relation);

    const res = await embeddings("DELETE", sourceType);

    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["company", "admin"],
    ["business_plan", "owner"],
  ])("deletes %s for relation %s", async (sourceType, relation) => {
    grantTuple(sourceType, "source-1", relation);

    const res = await embeddings("DELETE", sourceType);

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(sourceType, "source-1");
  });
});

describe("POST /api/rag/search", () => {
  it("limits a social session (role=admin) without a source type to support projects, without a database call", async () => {
    mockAuth.mockResolvedValue(socialSession());
    mockUserRole = "admin";

    const res = await search({ query: "q" });

    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ queryText: "q", sourceType: "support_project" });
    expect(mockPrismaCalls).toEqual([]);
  });

  it("searches support projects for any signed-in user", async () => {
    mockAuth.mockResolvedValue(socialSession());

    const res = await search({ query: "q", sourceType: "support_project" });

    expect(res.status).toBe(200);
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ sourceType: "support_project" });
  });

  it.each(["company", "business_plan"])(
    "refuses a non-admin searching %s, even with a relation (403, no search)",
    async (sourceType) => {
      mockAuth.mockResolvedValue(socialSession());
      mockUserRole = "admin";
      grantTuple(sourceType, "source-1", "owner");

      const res = await search({ query: "q", sourceType });

      expect(res.status).toBe(403);
      expect(mockSearch).not.toHaveBeenCalled();
    }
  );

  it("refuses a password sign-in whose user is no longer an admin", async () => {
    mockAuth.mockResolvedValue(passwordSession());
    mockUserRole = "user";

    const res = await search({ query: "q", sourceType: "company" });

    expect(res.status).toBe(403);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("lets an admin search every source type", async () => {
    mockAuth.mockResolvedValue(passwordSession());
    mockUserRole = "admin";

    const res = await search({ query: "q" });

    expect(res.status).toBe(200);
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ queryText: "q" });
    expect(mockSearch.mock.calls[0][0].sourceType).toBeUndefined();
  });

  it("lets an admin search company embeddings", async () => {
    mockAuth.mockResolvedValue(passwordSession());
    mockUserRole = "admin";

    const res = await search({ query: "q", sourceType: "company" });

    expect(res.status).toBe(200);
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ sourceType: "company" });
  });
});
