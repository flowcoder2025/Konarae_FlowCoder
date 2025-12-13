/**
 * Gemini 2.5 Pro Vision을 사용한 문서 분석 서비스
 * PDF 및 이미지 파일을 직접 처리
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { DocumentType, ExtractedData } from "./types";
import { getPromptForDocumentType } from "./prompts";

// ============================================
// 분석 결과 타입
// ============================================

export interface AnalysisResult {
  success: boolean;
  extractedData?: ExtractedData;
  summary?: string;
  keyInsights?: string[];
  confidenceScore?: number;
  error?: string;
}

// ============================================
// Gemini Vision 분석
// ============================================

/**
 * Gemini 2.5 Pro Vision으로 문서 분석
 * @param documentType 문서 유형
 * @param fileBase64 파일의 Base64 데이터
 * @param mimeType 파일의 MIME 타입
 */
export async function analyzeDocument(
  documentType: DocumentType,
  fileBase64: string,
  mimeType: string
): Promise<AnalysisResult> {
  try {
    const prompt = getPromptForDocumentType(documentType);

    // Gemini 2.5 Pro 모델 사용 (Vision 지원)
    const model = google("gemini-2.0-flash-exp");

    // Base64를 Data URL로 변환 (mimeType 포함)
    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    // Gemini API 호출
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image",
              image: dataUrl,
            },
          ],
        },
      ],
      temperature: 0.2, // 일관성 중요
    });

    // JSON 파싱
    const result = parseAnalysisResponse(text);

    if (!result) {
      return {
        success: false,
        error: "AI 응답을 파싱할 수 없습니다.",
      };
    }

    // 신뢰도 점수 계산 (간단한 휴리스틱)
    const confidenceScore = calculateConfidenceScore(result);

    return {
      success: true,
      extractedData: result.extractedData,
      summary: result.summary,
      keyInsights: result.keyInsights,
      confidenceScore,
    };
  } catch (error) {
    console.error("[analyzeDocument] Error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "문서 분석 중 오류가 발생했습니다.",
    };
  }
}

// ============================================
// 응답 파싱
// ============================================

interface ParsedResponse {
  extractedData: ExtractedData;
  summary: string;
  keyInsights: string[];
}

/**
 * Gemini 응답에서 JSON 추출 및 파싱
 */
function parseAnalysisResponse(text: string): ParsedResponse | null {
  try {
    // ```json ... ``` 블록 추출
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonText.trim());

    if (!parsed.extractedData || !parsed.summary) {
      console.error("[parseAnalysisResponse] Missing required fields");
      return null;
    }

    return {
      extractedData: parsed.extractedData,
      summary: parsed.summary,
      keyInsights: parsed.keyInsights || [],
    };
  } catch (error) {
    console.error("[parseAnalysisResponse] Parse error:", error);
    console.log("[parseAnalysisResponse] Raw text:", text);
    return null;
  }
}

// ============================================
// 신뢰도 점수 계산
// ============================================

/**
 * 추출된 데이터의 신뢰도 점수 계산 (0.0 ~ 1.0)
 * 간단한 휴리스틱:
 * - 필수 필드가 모두 채워져 있으면 +0.5
 * - 선택 필드가 채워져 있으면 각 +0.1 (최대 +0.5)
 */
function calculateConfidenceScore(result: ParsedResponse): number {
  let score = 0.5; // 기본 점수

  const data = result.extractedData as any;

  // 필수 필드 체크 (문서 유형에 따라 다름)
  const hasRequiredFields = Object.keys(data).some((key) => {
    const value = data[key];
    return value !== null && value !== undefined && value !== "";
  });

  if (hasRequiredFields) {
    score += 0.3;
  }

  // 선택 필드 체크
  const filledFieldsCount = Object.values(data).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== "";
  }).length;

  const optionalScore = Math.min(filledFieldsCount * 0.05, 0.2);
  score += optionalScore;

  return Math.min(score, 1.0);
}

// ============================================
// 재분석 (수정 등록 시)
// ============================================

/**
 * 문서 재분석
 * 기존 분석 결과를 참고하여 개선된 분석 수행
 */
export async function reanalyzeDocument(
  documentType: DocumentType,
  fileBase64: string,
  mimeType: string,
  previousAnalysis?: {
    extractedData: ExtractedData;
    summary: string;
  }
): Promise<AnalysisResult> {
  // 재분석은 일반 분석과 동일하게 처리
  // (향후 이전 분석 결과를 프롬프트에 포함하여 개선 가능)
  return analyzeDocument(documentType, fileBase64, mimeType);
}
