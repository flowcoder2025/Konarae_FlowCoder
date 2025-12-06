/**
 * Railway Microservices Integration (PRD 12.7)
 * - Document parsing (HWP, HWPX, PDF)
 * - Crawler orchestration
 */

const RAILWAY_BASE_URL =
  process.env.RAILWAY_API_URL || "http://localhost:3001";
const CRAWLER_SERVICE_URL =
  process.env.CRAWLER_SERVICE_URL || `${RAILWAY_BASE_URL}/crawler`;
const HWP_PARSER_URL =
  process.env.HWP_PARSER_URL || `${RAILWAY_BASE_URL}/parser/hwp`;
const PDF_PARSER_URL =
  process.env.PDF_PARSER_URL || `${RAILWAY_BASE_URL}/parser/pdf`;

export type ParserType = "hwp" | "hwpx" | "pdf";

export interface ParseResult {
  success: boolean;
  text: string;
  metadata?: {
    pages?: number;
    title?: string;
    author?: string;
    created?: string;
  };
  error?: string;
}

export interface CrawlResult {
  success: boolean;
  jobId: string;
  projectsFound?: number;
  error?: string;
}

/**
 * Parse document file using Railway microservices (PRD 3.2)
 */
export async function parseDocument(
  file: File | Buffer,
  type: ParserType
): Promise<ParseResult> {
  try {
    const formData = new FormData();

    if (Buffer.isBuffer(file)) {
      const arrayBuffer = file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer]);
      formData.append("file", blob, `document.${type}`);
    } else {
      formData.append("file", file);
    }

    const parserUrl = type === "pdf" ? PDF_PARSER_URL : HWP_PARSER_URL;

    const response = await fetch(`${parserUrl}/parse`, {
      method: "POST",
      body: formData,
      headers: {
        "X-Parser-Type": type,
      },
    });

    if (!response.ok) {
      throw new Error(`Parser failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      text: data.text || "",
      metadata: data.metadata,
    };
  } catch (error) {
    console.error(`[Railway] Parse error (${type}):`, error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Parse failed",
    };
  }
}

/**
 * Download and parse document from URL
 */
export async function parseDocumentFromUrl(
  url: string,
  type: ParserType
): Promise<ParseResult> {
  try {
    // Download file
    const fileResponse = await fetch(url);
    if (!fileResponse.ok) {
      throw new Error(`Download failed: ${fileResponse.statusText}`);
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    return parseDocument(buffer, type);
  } catch (error) {
    console.error("[Railway] Parse from URL error:", error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Download/parse failed",
    };
  }
}

/**
 * Trigger crawler for support projects (PRD 3.2)
 */
export async function triggerCrawl(sourceId: string): Promise<CrawlResult> {
  try {
    const response = await fetch(`${CRAWLER_SERVICE_URL}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceId }),
    });

    if (!response.ok) {
      throw new Error(`Crawler failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      jobId: data.jobId,
      projectsFound: data.projectsFound,
    };
  } catch (error) {
    console.error("[Railway] Crawl error:", error);
    return {
      success: false,
      jobId: "",
      error: error instanceof Error ? error.message : "Crawl failed",
    };
  }
}

/**
 * Get crawl job status
 */
export async function getCrawlJobStatus(
  jobId: string
): Promise<{
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  projectsFound?: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${CRAWLER_SERVICE_URL}/jobs/${jobId}`);

    if (!response.ok) {
      throw new Error(`Get job failed: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("[Railway] Get job status error:", error);
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Get status failed",
    };
  }
}
