/**
 * Railway Microservices Integration (PRD 12.7)
 * - Document parsing (HWP, HWPX, PDF)
 * - Crawler orchestration
 * - AI processing
 */

// Railway Microservices (필요한 것만)
const CRAWLER_SERVICE_URL =
  process.env.RAILWAY_CRAWLER_URL || "https://crawler-production-5fd6.up.railway.app";
const HWP_PARSER_URL =
  process.env.RAILWAY_HWP_PARSER_URL || "https://hwp-parser-production.up.railway.app";
const HWPX_PARSER_URL =
  process.env.RAILWAY_HWPX_PARSER_URL || "https://hwpx-parser-production.up.railway.app";
const PDF_PARSER_URL =
  process.env.RAILWAY_PDF_PARSER_URL || "https://pdf-parser-production-d43f.up.railway.app";
const AI_PROCESSOR_URL =
  process.env.RAILWAY_AI_PROCESSOR_URL || "https://ai-processor-production-4f58.up.railway.app";

export type ParserType = "hwp" | "hwpx" | "pdf";
export type ExtractMode = "full" | "text" | "metadata" | "tables";

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
 * 실제 프로덕션 마이크로서비스 사용
 */
export async function parseDocument(
  file: File | Buffer,
  type: ParserType,
  mode: ExtractMode = "full"
): Promise<ParseResult> {
  try {
    // Node.js 환경에서는 form-data 패키지 사용
    const FormDataNode = (await import("form-data")).default;
    const formData = new FormDataNode();

    if (Buffer.isBuffer(file)) {
      // Buffer를 직접 form-data에 추가
      formData.append("file", file, {
        filename: `document.${type}`,
        contentType: type === 'pdf' ? 'application/pdf' :
                     type === 'hwp' ? 'application/x-hwp' :
                     'application/vnd.hancom.hwpx'
      });
    } else {
      // File 객체 (브라우저 환경)
      formData.append("file", file);
    }

    // 파서 URL 선택
    let parserUrl: string;
    let endpoint: string;

    if (type === "pdf") {
      parserUrl = PDF_PARSER_URL;
      endpoint = mode === "full" ? "/parse" : `/parse/${mode}`;
    } else if (type === "hwpx") {
      parserUrl = HWPX_PARSER_URL;
      endpoint = "/parse";
    } else {
      // hwp
      parserUrl = HWP_PARSER_URL;
      if (mode === "text") endpoint = "/extract-text";
      else if (mode === "metadata") endpoint = "/extract-metadata";
      else if (mode === "tables") endpoint = "/extract-tables";
      else endpoint = "/parse";
    }

    // Use axios for proper form-data streaming support
    const axios = (await import("axios")).default;

    const response = await axios.post(`${parserUrl}${endpoint}`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const data = response.data;
    return {
      success: true,
      text: data.text || data.content || "",
      metadata: data.metadata,
    };
  } catch (error: any) {
    // Handle axios errors
    if (error.response) {
      const errorBody = typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data);

      console.error(`[Railway] ${type.toUpperCase()} parser error:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url || 'unknown',
        errorBody
      });

      return {
        success: false,
        text: "",
        error: `Parser failed: ${error.response.status} ${error.response.statusText}`,
      };
    }

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

/**
 * AI Processor - 문서 요약/분류 (PRD 3.3)
 */
export interface AIProcessRequest {
  text: string;
  task: "summarize" | "classify" | "extract-keywords" | "analyze-sentiment";
  options?: {
    maxLength?: number;
    language?: "ko" | "en";
    categories?: string[];
  };
}

export interface AIProcessResult {
  success: boolean;
  result?: {
    summary?: string;
    category?: string;
    keywords?: string[];
    sentiment?: "positive" | "neutral" | "negative";
    confidence?: number;
  };
  error?: string;
}

export async function processWithAI(
  request: AIProcessRequest
): Promise<AIProcessResult> {
  try {
    const response = await fetch(`${AI_PROCESSOR_URL}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AI processing failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      result: data,
    };
  } catch (error) {
    console.error("[Railway] AI processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "AI processing failed",
    };
  }
}

/**
 * Document Gateway - 통합 문서 처리
 */
export async function processDocumentComplete(
  file: File | Buffer,
  type: ParserType,
  options?: {
    extractMode?: ExtractMode;
    aiSummary?: boolean;
    aiClassify?: boolean;
  }
): Promise<{
  success: boolean;
  parsed?: ParseResult;
  aiResult?: AIProcessResult;
  error?: string;
}> {
  try {
    // 1. 문서 파싱
    const parsed = await parseDocument(file, type, options?.extractMode);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error,
      };
    }

    // 2. AI 처리 (선택적)
    let aiResult: AIProcessResult | undefined;
    if (options?.aiSummary && parsed.text) {
      aiResult = await processWithAI({
        text: parsed.text,
        task: "summarize",
        options: { language: "ko" },
      });
    }

    return {
      success: true,
      parsed,
      aiResult,
    };
  } catch (error) {
    console.error("[Railway] Complete document processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  }
}
