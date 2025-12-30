/**
 * 제출 전 검증 시스템 타입 정의
 * 사업계획서 제출 전 최종 점검을 위한 타입들
 */

// ============================================
// 검증 카테고리 및 상태
// ============================================

/** 검증 카테고리 */
export type VerificationCategory =
  | "format" // 문서 형식 (PDF, 페이지 수, 파일 크기)
  | "content" // 내용 완성도 (필수 섹션, 분량)
  | "attachment" // 첨부서류 (파일명, 형식, 필수 서류)
  | "calculation" // 계산 검증 (예산 합계, 비율)
  | "compliance" // 규정 준수 (공고 요건)

/** 검증 결과 상태 */
export type VerificationStatus = "pass" | "fail" | "warning"

/** 검증 전체 상태 */
export type VerificationJobStatus = "pending" | "processing" | "completed" | "failed"

// ============================================
// 검증 항목 (Verification Item)
// ============================================

/** 개별 검증 항목 */
export interface VerificationItem {
  id: string
  category: VerificationCategory
  title: string
  description: string
  status: VerificationStatus
  details?: string // 상세 설명 (실패/경고 시)
  suggestion?: string // 개선 제안
}

/** 검증 결과 요약 */
export interface VerificationSummary {
  totalItems: number
  passCount: number
  failCount: number
  warningCount: number
  overallStatus: VerificationStatus // 전체 통과 여부
}

// ============================================
// 검증 결과 (Verification Result)
// ============================================

/** 검증 결과 전체 */
export interface VerificationResult {
  summary: VerificationSummary
  items: VerificationItem[]
  verifiedAt: string
}

// ============================================
// API 요청/응답 타입
// ============================================

/** 검증 요청 */
export interface CreateVerificationRequest {
  userProjectId: string // 사용자 프로젝트 ID
}

/** 검증 응답 */
export interface VerificationResponse {
  id: string
  userProjectId: string
  userId: string
  status: VerificationJobStatus
  result: VerificationResult | null
  creditUsed: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

// ============================================
// 크래딧 정책
// ============================================

export const VERIFICATION_CREDIT_COST = 20 // 제출 전 검증 비용

// ============================================
// 카테고리 라벨 및 스타일
// ============================================

/** 카테고리 라벨 */
export const CATEGORY_LABELS: Record<VerificationCategory, string> = {
  format: "형식",
  content: "내용",
  attachment: "첨부",
  calculation: "계산",
  compliance: "규정",
}

/** 상태별 스타일 */
export const STATUS_STYLES: Record<
  VerificationStatus,
  { bg: string; text: string; border: string; label: string }
> = {
  pass: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-200",
    label: "통과",
  },
  fail: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    label: "실패",
  },
  warning: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-200",
    label: "주의",
  },
}
