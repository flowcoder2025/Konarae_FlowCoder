/**
 * Document Parser Unit Tests
 * Testing text_parser API client
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock axios
jest.mock("axios", () => ({
  default: {
    post: jest.fn(),
  },
}));

// Mock form-data
jest.mock("form-data", () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      append: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({
        "content-type": "multipart/form-data",
      }),
    })),
  };
});

describe("Document Parser - Configuration", () => {
  it("should have TEXT_PARSER_URL configured", () => {
    const url = process.env.TEXT_PARSER_URL || "http://localhost:8000";
    expect(url).toBeTruthy();
    expect(url).toMatch(/^https?:\/\//);
  });

  it("should use localhost as default URL in development", () => {
    const defaultUrl = "http://localhost:8000";
    expect(defaultUrl).toBe("http://localhost:8000");
  });
});

describe("Document Parser - Type Definitions", () => {
  it("should export ParserType union type", async () => {
    const { parseDocument } = await import("@/lib/document-parser");
    expect(parseDocument).toBeDefined();
    expect(typeof parseDocument).toBe("function");
  });

  it("should export ExtractMode union type", async () => {
    const types = await import("@/lib/document-parser");
    expect(types.parseDocument).toBeDefined();
    expect(types.parseDocumentFromUrl).toBeDefined();
  });
});

describe("Document Parser - API Response Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle successful JSON response", async () => {
    const axios = (await import("axios")).default;
    const mockResponse = {
      data: {
        status: "success",
        filename: "test.hwp",
        content: {
          paragraphs: [
            { text: "첫 번째 문단", style: "Normal" },
            { text: "두 번째 문단", style: "Normal" },
          ],
          metadata: {
            title: "테스트 문서",
            author: "작성자",
          },
        },
        processing_time: 0.234,
      },
    };

    (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { parseDocument } = await import("@/lib/document-parser");
    const buffer = Buffer.from("test content");
    const result = await parseDocument(buffer, "hwp", "full");

    expect(result.success).toBe(true);
    expect(result.text).toContain("첫 번째 문단");
    expect(result.text).toContain("두 번째 문단");
    expect(result.metadata?.title).toBe("테스트 문서");
  });

  it("should handle text extraction response", async () => {
    const axios = (await import("axios")).default;
    const mockResponse = {
      data: {
        status: "success",
        text: "순수 텍스트 내용입니다.",
        content: {
          word_count: 4,
        },
      },
    };

    (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { parseDocument } = await import("@/lib/document-parser");
    const buffer = Buffer.from("test content");
    const result = await parseDocument(buffer, "hwp", "text");

    expect(result.success).toBe(true);
    expect(result.text).toBe("순수 텍스트 내용입니다.");
  });

  it("should handle error response", async () => {
    const axios = (await import("axios")).default;
    const mockResponse = {
      data: {
        status: "error",
        error: "Unsupported file format",
      },
    };

    (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { parseDocument } = await import("@/lib/document-parser");
    const buffer = Buffer.from("invalid content");
    const result = await parseDocument(buffer, "hwp");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unsupported file format");
  });

  it("should handle network errors", async () => {
    const axios = (await import("axios")).default;
    (axios.post as jest.Mock).mockRejectedValueOnce(
      new Error("Network error")
    );

    const { parseDocument } = await import("@/lib/document-parser");
    const buffer = Buffer.from("test content");
    const result = await parseDocument(buffer, "pdf");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("should handle HTTP error responses", async () => {
    const axios = (await import("axios")).default;
    const httpError = {
      response: {
        status: 413,
        statusText: "Payload Too Large",
        data: "File too large",
      },
      config: {
        url: "http://localhost:8000/api/v1/extract/hwp-to-json",
      },
    };

    (axios.post as jest.Mock).mockRejectedValueOnce(httpError);

    const { parseDocument } = await import("@/lib/document-parser");
    const buffer = Buffer.from("large content");
    const result = await parseDocument(buffer, "hwp");

    expect(result.success).toBe(false);
    expect(result.error).toContain("413");
  });
});

describe("Document Parser - Endpoint Selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should use hwp-to-json endpoint for full mode", async () => {
    const axios = (await import("axios")).default;
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { status: "success", content: { paragraphs: [] } },
    });

    const { parseDocument } = await import("@/lib/document-parser");
    await parseDocument(Buffer.from("test"), "hwp", "full");

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/extract/hwp-to-json"),
      expect.anything(),
      expect.anything()
    );
  });

  it("should use hwp-to-text endpoint for text mode", async () => {
    const axios = (await import("axios")).default;
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { status: "success", text: "extracted text" },
    });

    const { parseDocument } = await import("@/lib/document-parser");
    await parseDocument(Buffer.from("test"), "hwp", "text");

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/extract/hwp-to-text"),
      expect.anything(),
      expect.anything()
    );
  });
});

describe("Document Parser - URL Parsing", () => {
  it("should download and parse document from URL", async () => {
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    }) as jest.Mock;

    const axios = (await import("axios")).default;
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { status: "success", text: "parsed from URL" },
    });

    const { parseDocumentFromUrl } = await import("@/lib/document-parser");
    const result = await parseDocumentFromUrl(
      "https://example.com/doc.hwp",
      "hwp"
    );

    expect(result.success).toBe(true);
  });

  it("should handle download errors", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      statusText: "Not Found",
    }) as jest.Mock;

    const { parseDocumentFromUrl } = await import("@/lib/document-parser");
    const result = await parseDocumentFromUrl(
      "https://example.com/missing.hwp",
      "hwp"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Download failed");
  });
});

describe("Document Parser - Service Health", () => {
  it("should check service availability", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
    }) as jest.Mock;

    const { isParserServiceAvailable } = await import("@/lib/document-parser");
    const available = await isParserServiceAvailable();

    expect(available).toBe(true);
  });

  it("should return false when service unavailable", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(
      new Error("Connection refused")
    ) as jest.Mock;

    const { isParserServiceAvailable } = await import("@/lib/document-parser");
    const available = await isParserServiceAvailable();

    expect(available).toBe(false);
  });

  it("should get service info", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: "0.2.0" }),
    }) as jest.Mock;

    const { getParserServiceInfo } = await import("@/lib/document-parser");
    const info = await getParserServiceInfo();

    expect(info.available).toBe(true);
    expect(info.version).toBe("0.2.0");
  });
});
