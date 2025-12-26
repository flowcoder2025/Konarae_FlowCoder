/**
 * 요구사항 추출기
 * Gemini를 사용하여 지원사업 공고에서 요구사항 추출
 */

import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { ExtractedRequirement } from "@/types/diagnosis"

// ============================================
// 프롬프트 템플릿
// ============================================

const REQUIREMENT_EXTRACTION_PROMPT = `## 역할
당신은 정부 지원사업 공고 분석 전문가입니다.
공고 내용을 분석하여 지원 자격 요건을 구조화해주세요.

## 공고 정보
제목: {projectName}
지원 대상: {target}
지원 조건: {eligibility}
지역: {region}
분야: {category}
요약: {summary}

{attachmentSection}

## 분석 지침
1. 필수 요구사항(required)과 우대 요구사항(preferred)을 구분하세요
2. 각 요구사항에 필요한 증빙 서류를 명시하세요
3. 카테고리별로 분류하세요: document, certification, financial, history, eligibility, other
4. 모호한 요건은 가장 일반적인 해석을 적용하세요
5. 중복되는 요건은 하나로 통합하세요

## 출력 형식 (JSON만 출력, 마크다운 코드블록 없이)
{
  "requirements": [
    {
      "id": "req_1",
      "category": "certification",
      "type": "required",
      "title": "벤처기업 인증",
      "description": "유효한 벤처기업 확인서 보유 필수",
      "evidence": "벤처기업확인서"
    }
  ]
}`

// ============================================
// 요구사항 추출 함수
// ============================================

export interface ProjectInfo {
  name: string
  target?: string | null
  eligibility?: string | null
  region?: string | null
  category?: string | null
  summary?: string | null
}

export interface AttachmentContent {
  fileName: string
  content: string
}

export interface RequirementExtractionResult {
  success: boolean
  requirements: ExtractedRequirement[]
  error?: string
}

/**
 * 지원사업 공고에서 요구사항 추출
 */
export async function extractRequirements(
  project: ProjectInfo,
  attachments?: AttachmentContent[]
): Promise<RequirementExtractionResult> {
  try {
    // 첨부파일 섹션 구성
    let attachmentSection = ""
    if (attachments && attachments.length > 0) {
      attachmentSection = `## 첨부파일 내용\n${attachments
        .map((a) => `### ${a.fileName}\n${a.content}`)
        .join("\n\n")}`
    }

    // 프롬프트 구성
    const prompt = REQUIREMENT_EXTRACTION_PROMPT.replace(
      "{projectName}",
      project.name
    )
      .replace("{target}", project.target || "정보 없음")
      .replace("{eligibility}", project.eligibility || "정보 없음")
      .replace("{region}", project.region || "전국")
      .replace("{category}", project.category || "정보 없음")
      .replace("{summary}", project.summary || "정보 없음")
      .replace("{attachmentSection}", attachmentSection)

    // Gemini 호출
    const model = google("gemini-2.5-flash-preview-05-20")

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.1, // 일관성 중요
    })

    // JSON 파싱
    const parsed = parseRequirementsResponse(text)

    if (!parsed) {
      return {
        success: false,
        requirements: [],
        error: "AI 응답을 파싱할 수 없습니다.",
      }
    }

    // ID 재생성 (일관성 보장)
    const requirements = parsed.requirements.map((req, idx) => ({
      ...req,
      id: `req_${idx + 1}`,
    }))

    return {
      success: true,
      requirements,
    }
  } catch (error) {
    console.error("[extractRequirements] Error:", error)
    return {
      success: false,
      requirements: [],
      error:
        error instanceof Error
          ? error.message
          : "요구사항 추출 중 오류가 발생했습니다.",
    }
  }
}

// ============================================
// 응답 파싱
// ============================================

interface ParsedRequirements {
  requirements: ExtractedRequirement[]
}

function parseRequirementsResponse(text: string): ParsedRequirements | null {
  try {
    // JSON 블록 추출 시도
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    let jsonText = jsonMatch ? jsonMatch[1] : text

    // 앞뒤 공백 및 불필요한 문자 제거
    jsonText = jsonText.trim()

    // JSON 시작/끝 위치 찾기
    const startIdx = jsonText.indexOf("{")
    const endIdx = jsonText.lastIndexOf("}")

    if (startIdx === -1 || endIdx === -1) {
      console.error("[parseRequirementsResponse] No JSON object found")
      return null
    }

    jsonText = jsonText.slice(startIdx, endIdx + 1)

    const parsed = JSON.parse(jsonText)

    if (!parsed.requirements || !Array.isArray(parsed.requirements)) {
      console.error("[parseRequirementsResponse] Missing requirements array")
      return null
    }

    // 필수 필드 검증 및 기본값 적용
    const validatedRequirements: ExtractedRequirement[] =
      parsed.requirements.map((req: Partial<ExtractedRequirement>, idx: number) => ({
        id: req.id || `req_${idx + 1}`,
        category: req.category || "other",
        type: req.type || "required",
        title: req.title || "요구사항",
        description: req.description || "",
        evidence: req.evidence,
      }))

    return { requirements: validatedRequirements }
  } catch (error) {
    console.error("[parseRequirementsResponse] Parse error:", error)
    console.log("[parseRequirementsResponse] Raw text:", text)
    return null
  }
}
