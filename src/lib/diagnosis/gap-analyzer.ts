/**
 * 갭 분석 엔진
 * Gemini를 사용하여 기업 현황과 요구사항 비교 분석
 */

import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import {
  ExtractedRequirement,
  GapItem,
  ActionItem,
  GapSeverity,
  RequirementCategory,
} from "@/types/diagnosis"

// ============================================
// 프롬프트 템플릿
// ============================================

const GAP_ANALYSIS_PROMPT = `## 역할
당신은 정부 지원사업 전문 컨설턴트입니다.
기업의 현재 상황과 공고 요구사항을 비교하여 부족한 점을 진단해주세요.

## 공고 요구사항
{requirements}

## 기업 현황
회사명: {companyName}
업종: {industry}
설립일: {foundedAt}
직원수: {employeeCount}명
매출액: {revenue}
주소: {address}
인증현황: {certifications}

## 보유 증빙 문서
{documents}

{ragContextSection}

## 분석 지침
1. 각 요구사항에 대해 충족 여부를 판단하세요
2. 미충족 항목에 대해 구체적인 갭을 설명하세요
3. 심각도를 판정하세요:
   - critical: 필수 요건 미충족 (탈락 요인)
   - high: 중요 요건 부족 (감점 요인)
   - medium: 개선 권장 사항
   - low: 우대 사항 미충족
4. 영향도(0-100)를 산정하세요: 합격에 미치는 영향력
5. 개선 액션을 우선순위(1이 가장 높음)로 정렬하세요
6. 실현 가능한 구체적인 액션을 제시하세요

## 출력 형식 (JSON만 출력, 마크다운 코드블록 없이)
{
  "fitScore": 72,
  "gaps": [
    {
      "id": "gap_1",
      "requirementId": "req_1",
      "category": "history",
      "severity": "critical",
      "requirement": "최근 3년간 매출 실적 3건 이상",
      "current": "1건 등록됨",
      "gap": "2건 추가 필요",
      "impact": 85
    }
  ],
  "actions": [
    {
      "id": "action_1",
      "gapId": "gap_1",
      "priority": 1,
      "title": "매출 실적 증빙 추가",
      "description": "실적증명서 또는 세금계산서 2건 이상 업로드 필요. 국세청 홈택스에서 발급 가능.",
      "documentType": "export_performance",
      "estimatedDays": 3
    }
  ]
}`

// ============================================
// 타입 정의
// ============================================

export interface CompanyInfo {
  name: string
  industry?: string | null
  foundedAt?: Date | null
  employeeCount?: number | null
  revenue?: string | null
  address?: string | null
  certifications?: string[]
}

export interface CompanyDocument {
  type: string
  analysisResult?: string | null
}

export interface RagContext {
  similarCases?: string[]
  successPatterns?: string[]
}

export interface GapAnalysisResult {
  success: boolean
  fitScore: number
  gaps: GapItem[]
  actions: ActionItem[]
  error?: string
}

// ============================================
// 갭 분석 함수
// ============================================

/**
 * 기업 현황과 요구사항을 비교하여 갭 분석 수행
 */
export async function analyzeGaps(
  requirements: ExtractedRequirement[],
  company: CompanyInfo,
  documents: CompanyDocument[],
  ragContext?: RagContext
): Promise<GapAnalysisResult> {
  try {
    // 요구사항 포맷팅
    const requirementsText = requirements
      .map(
        (r) =>
          `- [${r.id}] ${r.title} (${r.type === "required" ? "필수" : "우대"}): ${r.description}`
      )
      .join("\n")

    // 문서 정보 포맷팅
    const documentsText =
      documents.length > 0
        ? documents
            .map(
              (d) =>
                `- ${d.type}: ${d.analysisResult || "분석 결과 없음"}`
            )
            .join("\n")
        : "등록된 증빙 문서 없음"

    // RAG 컨텍스트 섹션
    let ragContextSection = ""
    if (ragContext?.similarCases?.length || ragContext?.successPatterns?.length) {
      ragContextSection = `## 유사 합격 사례 (참고)\n`
      if (ragContext.similarCases?.length) {
        ragContextSection += `### 유사 기업 사례\n${ragContext.similarCases.join("\n")}\n`
      }
      if (ragContext.successPatterns?.length) {
        ragContextSection += `### 성공 패턴\n${ragContext.successPatterns.join("\n")}\n`
      }
    }

    // 인증 현황 포맷팅
    const certificationsText =
      company.certifications && company.certifications.length > 0
        ? company.certifications.join(", ")
        : "없음"

    // 프롬프트 구성
    const prompt = GAP_ANALYSIS_PROMPT.replace("{requirements}", requirementsText)
      .replace("{companyName}", company.name)
      .replace("{industry}", company.industry || "정보 없음")
      .replace(
        "{foundedAt}",
        company.foundedAt
          ? new Date(company.foundedAt).toLocaleDateString("ko-KR")
          : "정보 없음"
      )
      .replace(
        "{employeeCount}",
        company.employeeCount?.toString() || "정보 없음"
      )
      .replace("{revenue}", company.revenue || "정보 없음")
      .replace("{address}", company.address || "정보 없음")
      .replace("{certifications}", certificationsText)
      .replace("{documents}", documentsText)
      .replace("{ragContextSection}", ragContextSection)

    // Gemini 호출
    const model = google("gemini-3-flash-preview")

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.2,
    })

    // JSON 파싱
    const parsed = parseGapAnalysisResponse(text)

    if (!parsed) {
      return {
        success: false,
        fitScore: 0,
        gaps: [],
        actions: [],
        error: "AI 응답을 파싱할 수 없습니다.",
      }
    }

    return {
      success: true,
      fitScore: parsed.fitScore,
      gaps: parsed.gaps,
      actions: parsed.actions,
    }
  } catch (error) {
    console.error("[analyzeGaps] Error:", error)
    return {
      success: false,
      fitScore: 0,
      gaps: [],
      actions: [],
      error:
        error instanceof Error
          ? error.message
          : "갭 분석 중 오류가 발생했습니다.",
    }
  }
}

// ============================================
// 응답 파싱
// ============================================

interface ParsedGapAnalysis {
  fitScore: number
  gaps: GapItem[]
  actions: ActionItem[]
}

function parseGapAnalysisResponse(text: string): ParsedGapAnalysis | null {
  try {
    // JSON 블록 추출 시도
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    let jsonText = jsonMatch ? jsonMatch[1] : text

    // 앞뒤 공백 제거
    jsonText = jsonText.trim()

    // JSON 시작/끝 위치 찾기
    const startIdx = jsonText.indexOf("{")
    const endIdx = jsonText.lastIndexOf("}")

    if (startIdx === -1 || endIdx === -1) {
      console.error("[parseGapAnalysisResponse] No JSON object found")
      return null
    }

    jsonText = jsonText.slice(startIdx, endIdx + 1)

    const parsed = JSON.parse(jsonText)

    // fitScore 검증
    const fitScore = Math.max(0, Math.min(100, parsed.fitScore || 50))

    // gaps 검증 및 정규화
    const gaps: GapItem[] = (parsed.gaps || []).map(
      (gap: Partial<GapItem>, idx: number) => ({
        id: gap.id || `gap_${idx + 1}`,
        requirementId: gap.requirementId || "",
        category: validateCategory(gap.category),
        severity: validateSeverity(gap.severity),
        requirement: gap.requirement || "",
        current: gap.current || "정보 없음",
        gap: gap.gap || "",
        impact: Math.max(0, Math.min(100, gap.impact || 50)),
      })
    )

    // actions 검증 및 정규화
    const actions: ActionItem[] = (parsed.actions || []).map(
      (action: Partial<ActionItem>, idx: number) => ({
        id: action.id || `action_${idx + 1}`,
        gapId: action.gapId || "",
        priority: action.priority || idx + 1,
        title: action.title || "개선 액션",
        description: action.description || "",
        documentType: action.documentType,
        estimatedDays: action.estimatedDays,
      })
    )

    return { fitScore, gaps, actions }
  } catch (error) {
    console.error("[parseGapAnalysisResponse] Parse error:", error)
    console.log("[parseGapAnalysisResponse] Raw text:", text)
    return null
  }
}

function validateCategory(category: string | undefined): RequirementCategory {
  const valid: RequirementCategory[] = [
    "document",
    "certification",
    "financial",
    "history",
    "eligibility",
    "other",
  ]
  return valid.includes(category as RequirementCategory)
    ? (category as RequirementCategory)
    : "other"
}

function validateSeverity(severity: string | undefined): GapSeverity {
  const valid: GapSeverity[] = ["critical", "high", "medium", "low"]
  return valid.includes(severity as GapSeverity)
    ? (severity as GapSeverity)
    : "medium"
}
