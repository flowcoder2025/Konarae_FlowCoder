/**
 * 마스터 프로필 시스템 상수 정의
 */

import type { ProfileBlockCategory } from "./types"

// ============================================
// 비용 설정
// ============================================

/** 마스터 프로필 생성 비용 (크레딧) */
export const MASTER_PROFILE_GENERATION_COST = 15

/** 첫 생성 무료 여부 */
export const FIRST_GENERATION_FREE = true

// ============================================
// 문서 요구사항
// ============================================

/** 마스터 프로필 생성에 필요한 최소 분석 문서 수 */
export const MIN_ANALYZED_DOCUMENTS = 3

/** 필수 문서 유형 (OR 조건) - 최소 1개씩 필요 */
export const REQUIRED_DOCUMENT_GROUPS = [
  // 그룹 1: 기업 등록 정보 (하나 이상)
  ["business_registration", "corporation_registry"],
  // 그룹 2: 재무/규모 정보 (하나 이상)
  ["financial_statement", "sme_certificate"],
] as const

/** 프로필 품질 향상에 기여하는 문서 유형 (가중치 순) */
export const QUALITY_BOOSTING_DOCUMENTS = [
  { type: "company_introduction", weight: 1.5, label: "회사소개서" },
  { type: "business_plan", weight: 1.4, label: "기존 사업계획서" },
  { type: "financial_statement", weight: 1.3, label: "재무제표" },
  { type: "patent", weight: 1.2, label: "특허" },
  { type: "certification", weight: 1.1, label: "인증서" },
  { type: "export_performance", weight: 1.1, label: "수출실적" },
] as const

// ============================================
// 블록 카테고리 설정
// ============================================

export interface BlockCategoryConfig {
  id: ProfileBlockCategory
  label: string
  description: string
  icon: string
  sourceDocumentTypes: string[] // "*" = 모든 문서 종합
  priority: number // 표시 순서
}

export const BLOCK_CATEGORIES: BlockCategoryConfig[] = [
  {
    id: "company_overview",
    label: "회사 개요",
    description: "기본 정보, 설립 배경, 연혁",
    icon: "Building2",
    sourceDocumentTypes: ["business_registration", "corporation_registry"],
    priority: 1,
  },
  {
    id: "business_description",
    label: "사업 내용",
    description: "주요 사업, 제품/서비스, 비전",
    icon: "Briefcase",
    sourceDocumentTypes: ["company_introduction", "business_plan"],
    priority: 2,
  },
  {
    id: "financials",
    label: "재무 현황",
    description: "매출, 자본금, 재무 건전성",
    icon: "TrendingUp",
    sourceDocumentTypes: ["financial_statement"],
    priority: 3,
  },
  {
    id: "human_resources",
    label: "인력 현황",
    description: "조직 구성, 핵심 인력, 채용 현황",
    icon: "Users",
    sourceDocumentTypes: ["employment_insurance"],
    priority: 4,
  },
  {
    id: "certifications",
    label: "인증 현황",
    description: "보유 인증, 자격, 지정 현황",
    icon: "Award",
    sourceDocumentTypes: ["certification", "sme_certificate"],
    priority: 5,
  },
  {
    id: "achievements",
    label: "실적/성과",
    description: "사업 실적, 수출, 특허, 수상",
    icon: "Trophy",
    sourceDocumentTypes: ["export_performance", "patent"],
    priority: 6,
  },
  {
    id: "capabilities",
    label: "핵심 역량",
    description: "기술력, 차별화 포인트, 경쟁력",
    icon: "Zap",
    sourceDocumentTypes: ["*"], // 종합 분석
    priority: 7,
  },
  {
    id: "market_position",
    label: "시장 포지션",
    description: "시장 현황, 경쟁 환경, 성장 가능성",
    icon: "Target",
    sourceDocumentTypes: ["*"], // 종합 분석
    priority: 8,
  },
]

/** 카테고리 ID로 설정 조회 */
export const getCategoryConfig = (
  categoryId: ProfileBlockCategory
): BlockCategoryConfig | undefined => {
  return BLOCK_CATEGORIES.find((c) => c.id === categoryId)
}

/** 카테고리별 맵 */
export const CATEGORY_MAP = BLOCK_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat
    return acc
  },
  {} as Record<ProfileBlockCategory, BlockCategoryConfig>
)

// ============================================
// UI 메시지
// ============================================

export const MASTER_PROFILE_MESSAGES = {
  // CTA 배너
  CTA_TITLE: "사업계획서 작성을 위한 마스터 프로필을 생성하세요",
  CTA_SUBTITLE: "마스터 프로필로 사업계획서를 더 쉽게 작성하세요",
  CTA_DESCRIPTION:
    "업로드된 증빙서류를 AI가 분석하여 사업계획서 작성에 바로 활용할 수 있는 블록으로 변환합니다.",
  CTA_QUALITY_TIP:
    "💡 재무제표, 회사소개서 등 참조자료가 많을수록 더 정교한 프로필이 생성됩니다.",
  CTA_FIRST_FREE: "✨ 첫 생성은 무료!",
  CTA_COST: `이후 ${MASTER_PROFILE_GENERATION_COST} 크레딧`,

  // 확인 모달
  MODAL_TITLE: "마스터 프로필 생성",
  MODAL_DESCRIPTION: "다음 문서들을 분석하여 프로필을 생성합니다:",
  MODAL_COST_FREE: "무료 (첫 생성)",
  MODAL_COST_CREDIT: `${MASTER_PROFILE_GENERATION_COST}C (재생성)`,
  MODAL_QUALITY_INFO:
    "문서가 많을수록 프로필 품질이 향상됩니다. 추가 문서를 업로드하면 더 정교한 분석이 가능합니다.",

  // 생성 중
  GENERATING_TITLE: "마스터 프로필 생성 중",
  GENERATING_DESCRIPTION: "AI가 문서를 분석하고 있습니다...",
  GENERATING_TIME: "예상 소요 시간: 30초~1분",

  // 에러
  ERROR_INSUFFICIENT_DOCUMENTS: `최소 ${MIN_ANALYZED_DOCUMENTS}개 이상의 분석된 문서가 필요합니다`,
  ERROR_INSUFFICIENT_CREDIT: "크레딧이 부족합니다",
  ERROR_GENERATION_FAILED: "프로필 생성에 실패했습니다. 다시 시도해주세요.",
  ERROR_REQUIRED_DOCUMENTS:
    "필수 문서가 부족합니다. 사업자등록증과 재무제표(또는 중소기업확인서)를 업로드해주세요.",

  // 성공
  SUCCESS_GENERATED: "마스터 프로필이 생성되었습니다",

  // 편집 페이지
  EDIT_PAGE_TITLE: "마스터 프로필",
  EDIT_PAGE_DESCRIPTION: "사업계획서 작성에 활용할 기업 정보 블록을 관리합니다.",
  REGENERATE_BUTTON: "재생성",
  SAVE_BUTTON: "저장",
} as const

// ============================================
// 품질 계산
// ============================================

/** 문서 수에 따른 예상 품질 점수 계산 (0-100) */
export function calculateExpectedQuality(documentTypes: string[]): number {
  let baseScore = 50

  // 문서 수 기본 점수 (최대 30점)
  const countBonus = Math.min(documentTypes.length * 5, 30)
  baseScore += countBonus

  // 품질 향상 문서 보너스 (최대 20점)
  let qualityBonus = 0
  for (const doc of QUALITY_BOOSTING_DOCUMENTS) {
    if (documentTypes.includes(doc.type)) {
      qualityBonus += 4 * doc.weight
    }
  }
  baseScore += Math.min(qualityBonus, 20)

  return Math.min(Math.round(baseScore), 100)
}

/** 품질 점수에 따른 레이블 */
export function getQualityLabel(score: number): {
  label: string
  color: string
} {
  if (score >= 90) return { label: "우수", color: "text-green-600" }
  if (score >= 75) return { label: "양호", color: "text-blue-600" }
  if (score >= 60) return { label: "보통", color: "text-yellow-600" }
  return { label: "기본", color: "text-gray-600" }
}

/** 품질 점수를 ExpectedQuality 타입으로 변환 */
export function getExpectedQualityLevel(score: number): "low" | "medium" | "high" | "excellent" {
  if (score >= 90) return "excellent"
  if (score >= 75) return "high"
  if (score >= 60) return "medium"
  return "low"
}

