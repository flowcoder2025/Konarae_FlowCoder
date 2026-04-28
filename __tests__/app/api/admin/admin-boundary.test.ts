/**
 * Pipeline and Monitoring Admin Route Authorization Boundary Tests
 *
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineJob: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    pipelineSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn(),
    },
    projectAttachment: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    supportProject: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    documentEmbedding: {
      count: jest.fn().mockResolvedValue(0),
    },
    crawlJob: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    crawlSource: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/auth-utils", () => {
  const { APIErrors } = jest.requireActual<typeof import("@/lib/api-error")>("@/lib/api-error");
  return {
    requireAdmin: jest.fn().mockRejectedValue(APIErrors.unauthorized()),
    requireAuth: jest.fn().mockRejectedValue(APIErrors.unauthorized()),
    isAdmin: jest.fn().mockResolvedValue(false),
  };
});

jest.mock("@/lib/document-parser", () => ({
  parseDocument: jest.fn(),
  getParserServiceInfo: jest.fn().mockResolvedValue({ available: false, url: "" }),
}));
jest.mock("@/lib/qstash", () => ({
  listSchedules: jest.fn().mockResolvedValue({ success: false }),
  isQStashConfigured: false,
}));
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: { from: jest.fn(() => ({ download: jest.fn() })) },
  })),
}));

import { POST as embedPOST } from "@/app/api/admin/pipeline/embed/route";
import { POST as parsePOST } from "@/app/api/admin/pipeline/parse/route";
import {
  GET as settingsGET,
  PATCH as settingsPATCH,
} from "@/app/api/admin/pipeline/settings/route";
import { GET as statsGET } from "@/app/api/admin/pipeline/stats/route";
import { GET as jobsGET } from "@/app/api/admin/pipeline/jobs/route";
import { GET as systemStatusGET } from "@/app/api/admin/system-status/route";
import { GET as liveStatusGET } from "@/app/api/admin/crawler/live-status/route";
import { APIErrors } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { parseDocument, getParserServiceInfo } from "@/lib/document-parser";
import { listSchedules } from "@/lib/qstash";
import { createClient } from "@supabase/supabase-js";

const prismaMock = prisma as jest.Mocked<typeof prisma>;
const requireAdminMock = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const parseDocumentMock = parseDocument as jest.MockedFunction<typeof parseDocument>;
const getParserServiceInfoMock = getParserServiceInfo as jest.MockedFunction<
  typeof getParserServiceInfo
>;
const listSchedulesMock = listSchedules as jest.MockedFunction<typeof listSchedules>;
const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

function makeRequest(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): NextRequest {
  const url = `http://localhost${path}`;
  if (body !== undefined) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }
  return new NextRequest(url, { method });
}

function makeInvalidJsonRequest(
  method: "POST" | "PATCH",
  path: string
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: "NOT_VALID_JSON{{{",
    headers: { "Content-Type": "application/json" },
  });
}

function expectRequireAdminCalled(): void {
  expect(requireAdminMock).toHaveBeenCalledTimes(1);
}

function expectNoInternalWork(): void {
  expect(prismaMock.pipelineJob.create).not.toHaveBeenCalled();
  expect(prismaMock.pipelineJob.update).not.toHaveBeenCalled();
  expect(prismaMock.pipelineJob.findMany).not.toHaveBeenCalled();
  expect(prismaMock.pipelineJob.count).not.toHaveBeenCalled();
  expect(prismaMock.pipelineSetting.findMany).not.toHaveBeenCalled();
  expect(prismaMock.pipelineSetting.createMany).not.toHaveBeenCalled();
  expect(prismaMock.pipelineSetting.upsert).not.toHaveBeenCalled();
  expect(prismaMock.projectAttachment.count).not.toHaveBeenCalled();
  expect(prismaMock.projectAttachment.findMany).not.toHaveBeenCalled();
  expect(prismaMock.projectAttachment.groupBy).not.toHaveBeenCalled();
  expect(prismaMock.projectAttachment.update).not.toHaveBeenCalled();
  expect(prismaMock.supportProject.count).not.toHaveBeenCalled();
  expect(prismaMock.supportProject.findMany).not.toHaveBeenCalled();
  expect(prismaMock.supportProject.update).not.toHaveBeenCalled();
  expect(prismaMock.documentEmbedding.count).not.toHaveBeenCalled();
  expect(prismaMock.crawlJob.count).not.toHaveBeenCalled();
  expect(prismaMock.crawlJob.findFirst).not.toHaveBeenCalled();
  expect(prismaMock.crawlJob.findMany).not.toHaveBeenCalled();
  expect(prismaMock.crawlSource.findMany).not.toHaveBeenCalled();
  expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  expect(parseDocumentMock).not.toHaveBeenCalled();
  expect(getParserServiceInfoMock).not.toHaveBeenCalled();
  expect(listSchedulesMock).not.toHaveBeenCalled();
  expect(createClientMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminMock.mockRejectedValue(APIErrors.unauthorized());
});

describe("Pipeline and monitoring admin route authorization boundary", () => {
  describe("POST /api/admin/pipeline/embed", () => {
    const apiPath = "/api/admin/pipeline/embed";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await embedPOST(makeRequest("POST", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineJob.create when unauthorized", async () => {
      await embedPOST(makeRequest("POST", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("returns 401 even when body is invalid JSON (auth fires before body parse)", async () => {
      const res = await embedPOST(makeInvalidJsonRequest("POST", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("POST /api/admin/pipeline/parse", () => {
    const apiPath = "/api/admin/pipeline/parse";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await parsePOST(makeRequest("POST", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineJob.create when unauthorized", async () => {
      await parsePOST(makeRequest("POST", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("returns 401 even when body is invalid JSON (auth fires before body parse)", async () => {
      const res = await parsePOST(makeInvalidJsonRequest("POST", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("PATCH /api/admin/pipeline/settings", () => {
    const apiPath = "/api/admin/pipeline/settings";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await settingsPATCH(makeRequest("PATCH", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineSetting.upsert when unauthorized", async () => {
      await settingsPATCH(makeRequest("PATCH", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("returns 401 even when body is invalid JSON (auth fires before body parse)", async () => {
      const res = await settingsPATCH(makeInvalidJsonRequest("PATCH", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("GET /api/admin/pipeline/stats", () => {
    const apiPath = "/api/admin/pipeline/stats";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await statsGET(makeRequest("GET", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineJob.findMany when unauthorized", async () => {
      await statsGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("GET /api/admin/pipeline/jobs", () => {
    const apiPath = "/api/admin/pipeline/jobs";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await jobsGET(makeRequest("GET", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineJob.findMany when unauthorized", async () => {
      await jobsGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("GET /api/admin/pipeline/settings", () => {
    const apiPath = "/api/admin/pipeline/settings";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await settingsGET(makeRequest("GET", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.pipelineSetting.findMany when unauthorized", async () => {
      await settingsGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("GET /api/admin/system-status", () => {
    const apiPath = "/api/admin/system-status";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await systemStatusGET(makeRequest("GET", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.$queryRaw when unauthorized", async () => {
      await systemStatusGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.crawlJob.count when unauthorized", async () => {
      await systemStatusGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("GET /api/admin/crawler/live-status", () => {
    const apiPath = "/api/admin/crawler/live-status";

    it("returns 401 when requireAdmin throws unauthorized", async () => {
      const res = await liveStatusGET(makeRequest("GET", apiPath));
      expect(res.status).toBe(401);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.crawlJob.findMany when unauthorized", async () => {
      await liveStatusGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("does not call prisma.crawlSource.findMany when unauthorized", async () => {
      await liveStatusGET(makeRequest("GET", apiPath));
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("403 Forbidden path", () => {
    beforeEach(() => {
      requireAdminMock.mockRejectedValue(APIErrors.forbidden());
    });

    it("POST /api/admin/pipeline/embed returns 403 for non-admin user", async () => {
      const res = await embedPOST(
        makeRequest("POST", "/api/admin/pipeline/embed")
      );
      expect(res.status).toBe(403);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("PATCH /api/admin/pipeline/settings returns 403 for non-admin user", async () => {
      const res = await settingsPATCH(
        makeRequest("PATCH", "/api/admin/pipeline/settings")
      );
      expect(res.status).toBe(403);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("GET /api/admin/system-status returns 403 for non-admin user", async () => {
      const res = await systemStatusGET(
        makeRequest("GET", "/api/admin/system-status")
      );
      expect(res.status).toBe(403);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });

    it("GET /api/admin/crawler/live-status returns 403 for non-admin user", async () => {
      const res = await liveStatusGET(
        makeRequest("GET", "/api/admin/crawler/live-status")
      );
      expect(res.status).toBe(403);
      expectRequireAdminCalled();
      expectNoInternalWork();
    });
  });

  describe("Cache-Control headers on successful responses", () => {
    it("GET /api/admin/pipeline/settings returns Cache-Control: private, no-store", async () => {
      requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } } as Awaited<
        ReturnType<typeof requireAdmin>
      >);

      (prismaMock.pipelineSetting.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: "1",
          type: "crawl",
          enabled: true,
          schedule: null,
          batchSize: 10,
          maxRetries: 3,
          timeout: 300000,
          options: null,
          updatedAt: new Date(),
        },
      ]);

      const res = await settingsGET(
        makeRequest("GET", "/api/admin/pipeline/settings")
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  });
});
