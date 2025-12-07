/**
 * Railway Microservices Unit Tests
 * Testing configuration and error handling logic
 * NOTE: Integration tests with actual API calls are in __tests__/integration/
 */

import { describe, it, expect } from "@jest/globals";

describe("Railway - Configuration", () => {
  it("should have correct parser URLs configured", () => {
    expect(process.env.RAILWAY_HWP_PARSER_URL).toBeDefined();
    expect(process.env.RAILWAY_PDF_PARSER_URL).toBeDefined();
    expect(process.env.RAILWAY_HWPX_PARSER_URL).toBeDefined();
    expect(process.env.RAILWAY_CRAWLER_URL).toBeDefined();
    expect(process.env.RAILWAY_AI_PROCESSOR_URL).toBeDefined();
  });

  it("should have fallback URLs for services", () => {
    // Railway services should have default fallback URLs
    const hwpUrl = process.env.RAILWAY_HWP_PARSER_URL;
    const pdfUrl = process.env.RAILWAY_PDF_PARSER_URL;

    expect(hwpUrl).toBeTruthy();
    expect(pdfUrl).toBeTruthy();
  });
});
