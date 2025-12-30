/**
 * 제출 전 검증 엔진
 * Gemini를 사용하여 사업계획서와 첨부서류를 검증
 */

import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import {
  VerificationItem,
  VerificationResult,
  VerificationCategory,
  VerificationStatus,
} from "@/types/verification"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ lib: "verification-verifier" })

// ============================================
// 프롬프트 템플릿
// ============================================

const VERIFICATION_PROMPT = `## 역할
당신은 정부 지원사업 제출 서류 검증 전문가입니다.
사업계획서와 첨부서류를 검토하여 제출 전 오류를 발견해주세요.

## 공고 정보
공고명: {projectName}
지원기관: {agency}
마감일: {deadline}
제출 요건: {requirements}

## 사업계획서 정보
제목: {planTitle}
페이지 수: {pageCount}
섹션 목록: {sections}

## 첨부서류 현황
{attachments}

## 기업 문서 현황
{companyDocuments}

## 검증 항목

### 1. 형식 검증 (format)
- PDF 형식 여부
- 페이지 수 제한 준수
- 파일 크기 제한

### 2. 내용 검증 (content)
- 필수 섹션 포함 여부
- 최소 분량 요건 충족
- 핵심 정보 누락 여부

### 3. 첨부서류 검증 (attachment)
- 필수 서류 첨부 여부
- 파일명 규정 준수
- 서류 유효기간

### 4. 계산 검증 (calculation)
- 예산 총액과 세부 항목 합계 일치
- 자부담 비율 준수
- 인건비 비율 준수

### 5. 규정 준수 (compliance)
- 공고 요건 충족
- 자격 요건 확인

## 출력 형식 (JSON만 출력, 마크다운 코드블록 없이)
{
  "items": [
    {
      "id": "v_1",
      "category": "format",
      "title": "문서 형식 검증",
      "description": "PDF 형식, 페이지 수 제한 준수",
      "status": "pass",
      "details": null,
      "suggestion": null
    },
    {
      "id": "v_2",
      "category": "attachment",
      "title": "첨부서류 검증",
      "description": "사업자등록증 파일명이 규정과 다릅니다",
      "status": "warning",
      "details": "파일명: 사업자등록증_ABC.pdf, 권장: 사업자등록증_기업명.pdf",
      "suggestion": "파일명을 공고 규정에 맞게 변경하세요"
    }
  ]
}`

// ============================================
// 타입 정의
// ============================================

export interface ProjectInfo {
  name: string
  agency?: string | null
  deadline?: Date | null
  requirements?: string | null
}

export interface BusinessPlanInfo {
  title: string
  pageCount?: number
  sections: string[]
}

export interface AttachmentInfo {
  name: string
  type: string
  size: number
}

export interface CompanyDocInfo {
  type: string
  fileName: string
  uploadedAt: Date
}

export interface VerifyParams {
  project: ProjectInfo
  businessPlan: BusinessPlanInfo | null
  attachments: AttachmentInfo[]
  companyDocuments: CompanyDocInfo[]
}

// ============================================
// 검증 함수
// ============================================

/**
 * 제출 전 검증 수행
 */
export async function verify(params: VerifyParams): Promise<VerificationResult> {
  const { project, businessPlan, attachments, companyDocuments } = params

  try {
    // 사업계획서가 없는 경우 기본 검증만 수행
    if (!businessPlan) {
      return createBasicVerificationResult(attachments, companyDocuments)
    }

    // 첨부서류 포맷팅
    const attachmentsText =
      attachments.length > 0
        ? attachments
            .map((a) => `- ${a.name} (${a.type}, ${formatFileSize(a.size)})`)
            .join("\n")
        : "첨부된 파일 없음"

    // 기업 문서 포맷팅
    const companyDocsText =
      companyDocuments.length > 0
        ? companyDocuments
            .map(
              (d) =>
                `- ${d.type}: ${d.fileName} (${new Date(d.uploadedAt).toLocaleDateString("ko-KR")})`
            )
            .join("\n")
        : "등록된 기업 문서 없음"

    // 프롬프트 구성
    const prompt = VERIFICATION_PROMPT.replace("{projectName}", project.name)
      .replace("{agency}", project.agency || "정보 없음")
      .replace(
        "{deadline}",
        project.deadline
          ? new Date(project.deadline).toLocaleDateString("ko-KR")
          : "정보 없음"
      )
      .replace("{requirements}", project.requirements || "요건 정보 없음")
      .replace("{planTitle}", businessPlan.title)
      .replace("{pageCount}", businessPlan.pageCount?.toString() || "알 수 없음")
      .replace("{sections}", businessPlan.sections.join(", ") || "섹션 정보 없음")
      .replace("{attachments}", attachmentsText)
      .replace("{companyDocuments}", companyDocsText)

    // Gemini 호출
    const model = google("gemini-2.0-flash")

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.2,
    })

    // JSON 파싱
    const parsed = parseVerificationResponse(text)

    if (!parsed) {
      logger.error("Failed to parse verification response")
      return createFallbackResult()
    }

    return createVerificationResult(parsed.items)
  } catch (error) {
    logger.error("verify error", { error })
    return createFallbackResult()
  }
}

// ============================================
// 응답 파싱
// ============================================

interface ParsedVerification {
  items: VerificationItem[]
}

function parseVerificationResponse(text: string): ParsedVerification | null {
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
      logger.error("parseVerificationResponse: No JSON object found")
      return null
    }

    jsonText = jsonText.slice(startIdx, endIdx + 1)

    const parsed = JSON.parse(jsonText)

    // items 검증 및 정규화
    const items: VerificationItem[] = (parsed.items || []).map(
      (item: Partial<VerificationItem>, idx: number) => ({
        id: item.id || `v_${idx + 1}`,
        category: validateCategory(item.category),
        title: item.title || "검증 항목",
        description: item.description || "",
        status: validateStatus(item.status),
        details: item.details || undefined,
        suggestion: item.suggestion || undefined,
      })
    )

    return { items }
  } catch (error) {
    logger.error("parseVerificationResponse parse error", { error, rawText: text })
    return null
  }
}

function validateCategory(category: string | undefined): VerificationCategory {
  const valid: VerificationCategory[] = [
    "format",
    "content",
    "attachment",
    "calculation",
    "compliance",
  ]
  return valid.includes(category as VerificationCategory)
    ? (category as VerificationCategory)
    : "compliance"
}

function validateStatus(status: string | undefined): VerificationStatus {
  const valid: VerificationStatus[] = ["pass", "fail", "warning"]
  return valid.includes(status as VerificationStatus)
    ? (status as VerificationStatus)
    : "warning"
}

// ============================================
// 헬퍼 함수
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${bytes}B`
}

function createVerificationResult(items: VerificationItem[]): VerificationResult {
  const passCount = items.filter((i) => i.status === "pass").length
  const failCount = items.filter((i) => i.status === "fail").length
  const warningCount = items.filter((i) => i.status === "warning").length

  return {
    summary: {
      totalItems: items.length,
      passCount,
      failCount,
      warningCount,
      overallStatus: failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass",
    },
    items,
    verifiedAt: new Date().toISOString(),
  }
}

function createBasicVerificationResult(
  attachments: AttachmentInfo[],
  companyDocuments: CompanyDocInfo[]
): VerificationResult {
  const items: VerificationItem[] = []

  // 사업계획서 없음 경고
  items.push({
    id: "v_bp",
    category: "content",
    title: "사업계획서 미작성",
    description: "사업계획서가 아직 작성되지 않았습니다",
    status: "fail",
    suggestion: "사업계획서를 먼저 작성해주세요",
  })

  // 첨부서류 확인
  if (attachments.length === 0) {
    items.push({
      id: "v_att",
      category: "attachment",
      title: "첨부서류 없음",
      description: "첨부된 파일이 없습니다",
      status: "warning",
      suggestion: "필요한 첨부서류를 추가해주세요",
    })
  } else {
    items.push({
      id: "v_att",
      category: "attachment",
      title: "첨부서류 확인",
      description: `${attachments.length}개의 파일이 첨부되었습니다`,
      status: "pass",
    })
  }

  // 기업 문서 확인
  if (companyDocuments.length === 0) {
    items.push({
      id: "v_doc",
      category: "attachment",
      title: "기업 증빙서류 없음",
      description: "등록된 기업 증빙서류가 없습니다",
      status: "warning",
      suggestion: "기업 정보에서 증빙서류를 등록해주세요",
    })
  } else {
    items.push({
      id: "v_doc",
      category: "attachment",
      title: "기업 증빙서류 확인",
      description: `${companyDocuments.length}개의 기업 문서가 등록되었습니다`,
      status: "pass",
    })
  }

  return createVerificationResult(items)
}

function createFallbackResult(): VerificationResult {
  return {
    summary: {
      totalItems: 1,
      passCount: 0,
      failCount: 1,
      warningCount: 0,
      overallStatus: "fail",
    },
    items: [
      {
        id: "v_error",
        category: "compliance",
        title: "검증 실패",
        description: "검증 중 오류가 발생했습니다",
        status: "fail",
        suggestion: "잠시 후 다시 시도해주세요",
      },
    ],
    verifiedAt: new Date().toISOString(),
  }
}
