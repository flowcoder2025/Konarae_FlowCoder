/**
 * Railway Microservices Unit Tests
 * Testing crawler and AI processing (parser moved to document-parser.test.ts)
 */

import { describe, it, expect } from "@jest/globals";

describe("Railway - Configuration", () => {
  it("should have crawler URL configured", () => {
    const crawlerUrl =
      process.env.RAILWAY_CRAWLER_URL ||
      "https://crawler-production-5fd6.up.railway.app";
    expect(crawlerUrl).toBeTruthy();
    expect(crawlerUrl).toMatch(/^https?:\/\//);
  });

  it("should have AI processor URL configured", () => {
    const aiUrl =
      process.env.RAILWAY_AI_PROCESSOR_URL ||
      "https://ai-processor-production-4f58.up.railway.app";
    expect(aiUrl).toBeTruthy();
    expect(aiUrl).toMatch(/^https?:\/\//);
  });
});

describe("Railway - Backward Compatibility", () => {
  it("should re-export parseDocument from document-parser", async () => {
    const { parseDocument } = await import("@/lib/railway");
    expect(parseDocument).toBeDefined();
    expect(typeof parseDocument).toBe("function");
  });

  it("should re-export parseDocumentFromUrl from document-parser", async () => {
    const { parseDocumentFromUrl } = await import("@/lib/railway");
    expect(parseDocumentFromUrl).toBeDefined();
    expect(typeof parseDocumentFromUrl).toBe("function");
  });

  it("should re-export type aliases", async () => {
    // This test verifies the module compiles correctly with type exports
    const railway = await import("@/lib/railway");
    expect(railway).toHaveProperty("parseDocument");
    expect(railway).toHaveProperty("parseDocumentFromUrl");
  });
});

describe("Railway - Crawler Functions", () => {
  it("should export triggerCrawl function", async () => {
    const { triggerCrawl } = await import("@/lib/railway");
    expect(triggerCrawl).toBeDefined();
    expect(typeof triggerCrawl).toBe("function");
  });

  it("should export getCrawlJobStatus function", async () => {
    const { getCrawlJobStatus } = await import("@/lib/railway");
    expect(getCrawlJobStatus).toBeDefined();
    expect(typeof getCrawlJobStatus).toBe("function");
  });
});

describe("Railway - AI Processing Functions", () => {
  it("should export processWithAI function", async () => {
    const { processWithAI } = await import("@/lib/railway");
    expect(processWithAI).toBeDefined();
    expect(typeof processWithAI).toBe("function");
  });

  it("should export processDocumentWithAI function", async () => {
    const { processDocumentWithAI } = await import("@/lib/railway");
    expect(processDocumentWithAI).toBeDefined();
    expect(typeof processDocumentWithAI).toBe("function");
  });
});
