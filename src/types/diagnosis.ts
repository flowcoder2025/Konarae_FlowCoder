/**
 * 부족항목 진단 시스템 타입 정의
 * @see /docs/gap-diagnosis-plan.md
 */

// ============================================
// 요구사항 추출 (Requirement Extraction)
// ============================================

/** 요구사항 카테고리 */
export type RequirementCategory =
  | "document" // 필수 제출 서류
  | "certification" // 인증/자격 요건
  | "financial" // 재무 요건
  | "history" // 실적 요건
  | "eligibility" // 자격 요건
  | "other" // 기타

/** 요구사항 유형 */
export type RequirementType = "required" | "preferred"

/** 추출된 요구사항 */
export interface ExtractedRequirement {
  id: string
  category: RequirementCategory
  type: RequirementType
  title: string
  description: string
  evidence?: string // 필요한 증빙 종류
}

// ============================================
// 갭 분석 (Gap Analysis)
// ============================================

/** 갭 심각도 */
export type GapSeverity = "critical" | "high" | "medium" | "low"

/** 부족 항목 */
export interface GapItem {
  id: string
  requirementId: string
  category: RequirementCategory
  severity: GapSeverity
  requirement: string // 공고 요구사항
  current: string // 현재 상태
  gap: string // 부족한 점
  impact: number // 영향도 0-100
}

/** 개선 액션 */
export interface ActionItem {
  id: string
  gapId: string
  priority: number // 1 = 최우선
  title: string
  description: string
  documentType?: string // CompanyDocument 유형
  estimatedDays?: number // 예상 소요 일수
}

// ============================================
// 진단 결과 (Diagnosis Result)
// ============================================

/** 진단 상태 */
export type DiagnosisStatus = "pending" | "processing" | "completed" | "failed"

/** 진단 결과 전체 */
export interface DiagnosisResult {
  fitScore: number
  requirements: ExtractedRequirement[]
  gaps: GapItem[]
  actions: ActionItem[]
}

// ============================================
// API 요청/응답 타입
// ============================================

/** 진단 요청 */
export interface CreateDiagnosisRequest {
  companyId: string
  projectId: string
}

/** 진단 응답 */
export interface DiagnosisResponse {
  id: string
  companyId: string
  projectId: string
  userId: string
  status: DiagnosisStatus
  fitScore: number | null
  requirements: ExtractedRequirement[] | null
  gaps: GapItem[] | null
  actions: ActionItem[] | null
  creditUsed: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
  // 관계 데이터 (선택적)
  company?: {
    id: string
    name: string
  }
  project?: {
    id: string
    name: string
  }
}

/** 진단 목록 응답 */
export interface DiagnosisListResponse {
  diagnoses: DiagnosisResponse[]
  total: number
  page: number
  limit: number
}

// ============================================
// 크래딧 시스템 타입
// ============================================

/** 크래딧 거래 유형 */
export type CreditTransactionType =
  | "signup_bonus" // 가입 보너스
  | "purchase" // 구매
  | "usage" // 사용
  | "refund" // 환불

/** 크래딧 관련 서비스 유형 */
export type CreditRelatedType =
  | "diagnosis" // 부족항목 진단
  | "check" // 제출 전 점검
  | "generation" // 생성 (사업계획서, PPT 등)
  | "master_profile" // 마스터 프로필 생성

/** 크래딧 잔액 응답 */
export interface CreditBalanceResponse {
  balance: number
  totalPurchased: number
  totalUsed: number
}

/** 크래딧 거래 내역 */
export interface CreditTransactionResponse {
  id: string
  type: CreditTransactionType
  amount: number
  balanceAfter: number
  description: string
  relatedType: CreditRelatedType | null
  relatedId: string | null
  createdAt: string
}

/** 크래딧 사용 요청 */
export interface UseCreditRequest {
  amount: number
  description: string
  relatedType: CreditRelatedType
  relatedId: string
}

/** 크래딧 사용 응답 */
export interface UseCreditResponse {
  success: boolean
  newBalance: number
  transactionId: string
}

// ============================================
// 크래딧 정책 상수
// ============================================

export const CREDIT_COSTS = {
  DIAGNOSIS: 15, // 부족항목 진단
  DIAGNOSIS_REFRESH: 15, // 진단 업데이트
  SUBMISSION_CHECK: 20, // 제출 전 점검 (향후)
  BUSINESS_PLAN_GENERATION: 30, // 사업계획서 생성 (향후)
} as const

export const INITIAL_CREDIT_BONUS = 100 // 신규 가입 시 무료 크래딧

// ============================================
// 유틸리티 타입
// ============================================

/** 심각도별 색상 매핑 */
export const SEVERITY_COLORS: Record<
  GapSeverity,
  { text: string; bg: string; border: string }
> = {
  critical: {
    text: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  high: {
    text: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  medium: {
    text: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
  low: {
    text: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
}

/** 심각도 라벨 */
export const SEVERITY_LABELS: Record<GapSeverity, string> = {
  critical: "필수",
  high: "중요",
  medium: "권장",
  low: "선호",
}

/** 카테고리 라벨 */
export const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  document: "제출 서류",
  certification: "인증/자격",
  financial: "재무 요건",
  history: "실적 요건",
  eligibility: "자격 요건",
  other: "기타",
}
