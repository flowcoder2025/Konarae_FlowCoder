/**
 * Railway Microservices Integration (PRD 12.7)
 * - Crawler orchestration
 * - AI processing
 *
 * NOTE: 문서 파싱은 document-parser.ts로 이전됨
 * @see src/lib/document-parser.ts
 */

// Railway Microservices URLs
const CRAWLER_SERVICE_URL =
  process.env.RAILWAY_CRAWLER_URL ||
  "https://crawler-production-5fd6.up.railway.app";
const AI_PROCESSOR_URL =
  process.env.RAILWAY_AI_PROCESSOR_URL ||
  "https://ai-processor-production-4f58.up.railway.app";

// Re-export document parser for backward compatibility
export {
  parseDocument,
  parseDocumentFromUrl,
  type ParserType,
  type ExtractMode,
  type ParseResult,
} from "./document-parser";

export interface CrawlResult {
  success: boolean;
  jobId: string;
  projectsFound?: number;
  error?: string;
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
export async function getCrawlJobStatus(jobId: string): Promise<{
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
 * NOTE: 파싱은 document-parser.ts 사용, AI 처리만 담당
 */
export async function processDocumentWithAI(
  text: string,
  options?: {
    aiSummary?: boolean;
    aiClassify?: boolean;
  }
): Promise<{
  success: boolean;
  aiResult?: AIProcessResult;
  error?: string;
}> {
  try {
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: "No text provided for AI processing",
      };
    }

    // AI 처리 (선택적)
    let aiResult: AIProcessResult | undefined;
    if (options?.aiSummary) {
      aiResult = await processWithAI({
        text,
        task: "summarize",
        options: { language: "ko" },
      });
    }

    return {
      success: true,
      aiResult,
    };
  } catch (error) {
    console.error("[Railway] Document AI processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  }
}
