/**
 * Document Parser Client
 * HWP, HWPX, PDF 문서 파싱 (text_parser API 사용)
 *
 * API Repository: https://github.com/Jerome87hyunil/text_parser
 * Endpoints:
 *   - POST /api/v1/extract/hwp-to-json  (구조화된 JSON)
 *   - POST /api/v1/extract/hwp-to-text  (순수 텍스트)
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "document-parser" });

// Text Parser 서비스 URL (단일 통합 서비스)
// Repository: https://github.com/Jerome87hyunil/text_parser
const TEXT_PARSER_URL = process.env.TEXT_PARSER_URL || "https://hwp-api.onrender.com";

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

/**
 * Text Parser API 응답 형식
 */
interface TextParserResponse {
  success?: boolean;
  status?: "success" | "error";
  filename?: string;
  format?: string;
  message?: string;
  content?:
    | string // hwp-to-text 응답 (직접 텍스트)
    | {
        paragraphs?: Array<{ text: string; style?: string }>;
        tables?: Array<{ rows: string[][] }>;
        metadata?: {
          title?: string;
          author?: string;
          created?: string;
          pages?: number;
        };
        text?: string;
        word_count?: number;
        version?: string;
        extracted_at?: string;
        statistics?: Record<string, unknown>;
      };
  text?: string; // 직접 텍스트 응답 (일부 엔드포인트)
  processing_time?: number;
  error?: string;
  detail?: string; // FastAPI 에러 상세
}

/**
 * 파일 확장자에 따른 MIME 타입 반환
 */
function getMimeType(type: ParserType): string {
  switch (type) {
    case "pdf":
      return "application/pdf";
    case "hwp":
      return "application/x-hwp";
    case "hwpx":
      return "application/vnd.hancom.hwpx";
    default:
      return "application/octet-stream";
  }
}

/**
 * 추출 모드에 따른 엔드포인트 결정
 */
function getEndpoint(mode: ExtractMode): string {
  switch (mode) {
    case "text":
      return "/api/v1/extract/hwp-to-text";
    case "full":
    case "metadata":
    case "tables":
    default:
      return "/api/v1/extract/hwp-to-json";
  }
}

/**
 * API 응답에서 텍스트 추출
 */
function extractTextFromResponse(response: TextParserResponse): string {
  // 직접 text 필드가 있는 경우
  if (response.text) {
    return response.text;
  }

  // content가 문자열인 경우 (hwp-to-text API 응답)
  if (typeof response.content === "string") {
    return response.content;
  }

  // content.text 필드 (일부 응답)
  if (response.content?.text) {
    return response.content.text;
  }

  // paragraphs에서 텍스트 조합
  if (response.content?.paragraphs && response.content.paragraphs.length > 0) {
    return response.content.paragraphs
      .map((p) => p.text)
      .filter((t) => t && t.trim())
      .join("\n\n");
  }

  return "";
}

/**
 * API 응답에서 메타데이터 추출
 */
function extractMetadataFromResponse(
  response: TextParserResponse
): ParseResult["metadata"] {
  // content가 string인 경우 메타데이터 없음
  if (!response.content || typeof response.content === "string") {
    return undefined;
  }

  const meta = response.content.metadata;
  if (!meta) {
    return undefined;
  }

  return {
    title: meta.title,
    author: meta.author,
    created: meta.created,
    pages: meta.pages,
  };
}

/**
 * Parse document file using text_parser API
 *
 * @param file - File 객체 또는 Buffer
 * @param type - 파일 타입 (hwp, hwpx, pdf)
 * @param mode - 추출 모드 (full, text, metadata, tables)
 * @returns ParseResult
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
        contentType: getMimeType(type),
      });
    } else {
      // File 객체 (브라우저 환경)
      const buffer = Buffer.from(await file.arrayBuffer());
      formData.append("file", buffer, {
        filename: file.name || `document.${type}`,
        contentType: getMimeType(type),
      });
    }

    const endpoint = getEndpoint(mode);
    const url = `${TEXT_PARSER_URL}${endpoint}`;

    logger.info(`Parsing ${type.toUpperCase()} file at ${url}`);

    // Use axios for proper form-data streaming support
    const axios = (await import("axios")).default;

    const response = await axios.post<TextParserResponse>(url, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000, // 60초 타임아웃
    });

    const data = response.data;

    // 에러 응답 처리
    if (data.success === false || data.status === "error" || data.error || data.detail) {
      const errorMsg = data.error || data.detail || data.message || "Unknown parser error";
      logger.error(`Parser error: ${errorMsg}`);
      return {
        success: false,
        text: "",
        error: errorMsg,
      };
    }

    // 텍스트 추출
    const extractedText = extractTextFromResponse(data);

    if (!extractedText || extractedText.trim().length === 0) {
      logger.warn(`No text extracted from ${type} file`);
    } else {
      logger.info(`Extracted ${extractedText.length} characters`);
    }

    return {
      success: true,
      text: extractedText,
      metadata: extractMetadataFromResponse(data),
    };
  } catch (error: any) {
    // Handle axios errors
    if (error.response) {
      const errorBody =
        typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);

      logger.error(`${type.toUpperCase()} parser error`, {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url || "unknown",
        errorBody,
      });

      return {
        success: false,
        text: "",
        error: `Parser failed: ${error.response.status} ${error.response.statusText}`,
      };
    }

    // Network or other errors
    logger.error(`Parse error (${type})`, { error: error.message });
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
    logger.info(`Downloading file from URL: ${url}`);

    // Download file
    const fileResponse = await fetch(url);
    if (!fileResponse.ok) {
      throw new Error(`Download failed: ${fileResponse.statusText}`);
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    logger.info(`Downloaded ${buffer.length} bytes`);

    return parseDocument(buffer, type);
  } catch (error) {
    logger.error("Parse from URL error", { error });
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Download/parse failed",
    };
  }
}

/**
 * Check if the parser service is available
 */
export async function isParserServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${TEXT_PARSER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get parser service info
 */
export async function getParserServiceInfo(): Promise<{
  available: boolean;
  url: string;
  version?: string;
}> {
  try {
    const response = await fetch(`${TEXT_PARSER_URL}/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        url: TEXT_PARSER_URL,
        version: data.version,
      };
    }

    return {
      available: false,
      url: TEXT_PARSER_URL,
    };
  } catch {
    return {
      available: false,
      url: TEXT_PARSER_URL,
    };
  }
}
