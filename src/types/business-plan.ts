/**
 * 사업계획서 작성 폼 구조화된 입력 타입
 * 마스터 프로필(과거/현재)과 함께 미래 지향적 정보를 수집
 */

// 마일스톤 (추진 일정)
export interface Milestone {
  phase: string           // 단계명 (예: "1단계: 기술 개발")
  period: string          // 기간 (예: "1~3개월")
  tasks: string           // 주요 과업
  deliverables: string    // 산출물
}

// 추진 계획
export interface ExecutionPlan {
  duration: string               // 총 사업 기간 (예: "12개월")
  milestones: Milestone[]        // 주요 마일스톤
  teamPlan?: string              // 인력 투입 계획 (선택)
}

// 예산 항목
export interface BudgetItem {
  category: string        // 항목 (인건비, 재료비 등)
  amount: number          // 금액
  description?: string    // 설명 (선택)
}

// 예산 계획
export interface BudgetPlan {
  totalAmount: number            // 총 사업비
  governmentFunding: number      // 정부지원금
  selfFunding: number            // 자부담
  breakdown?: BudgetItem[]       // 세부 항목 (선택)
}

// 기대 효과
export interface ExpectedOutcomes {
  revenueTarget?: string         // 매출 목표 (예: "사업 종료 후 3년 내 10억원")
  employmentTarget?: string      // 고용 창출 목표 (예: "신규 5명 채용")
  exportTarget?: string          // 수출 목표 (예: "2억원 수출")
  patentTarget?: string          // 특허/IP 목표 (예: "특허 2건 출원")
  otherMetrics?: string[]        // 기타 성과 지표
}

// 신규 사업 정보 (지원사업 선택 안 했을 때)
export interface NewBusinessInfo {
  name: string                    // 사업명
  summary: string                 // 사업 개요 (200자 이내)
  problemStatement: string        // 해결하고자 하는 문제
  solutionApproach: string        // 해결 방안/접근법
  targetMarket: string            // 목표 시장/고객
  differentiators: string[]       // 차별화 포인트 (배열)
}

// 사업계획서 작성 폼 데이터
export interface BusinessPlanFormData {
  // 기존 필드
  title: string
  companyId: string
  projectId: string

  // 신규 사업 설명 (기존 자유 텍스트 유지 - 하위 호환)
  newBusinessDescription: string
  additionalNotes: string

  // 🆕 구조화된 입력 (선택적으로 추가)
  newBusiness?: NewBusinessInfo
  executionPlan?: ExecutionPlan
  budgetPlan?: BudgetPlan
  expectedOutcomes?: ExpectedOutcomes
}

// 기본값 생성 함수
export function createEmptyExecutionPlan(): ExecutionPlan {
  return {
    duration: "",
    milestones: [
      { phase: "1단계", period: "", tasks: "", deliverables: "" },
    ],
    teamPlan: "",
  }
}

export function createEmptyBudgetPlan(): BudgetPlan {
  return {
    totalAmount: 0,
    governmentFunding: 0,
    selfFunding: 0,
    breakdown: [],
  }
}

export function createEmptyExpectedOutcomes(): ExpectedOutcomes {
  return {
    revenueTarget: "",
    employmentTarget: "",
    exportTarget: "",
    patentTarget: "",
    otherMetrics: [],
  }
}

// 예산 항목 카테고리 (정부 사업 표준)
export const BUDGET_CATEGORIES = [
  { id: "labor", label: "인건비", description: "연구원, 개발자 인건비" },
  { id: "materials", label: "재료비", description: "원자재, 부품비" },
  { id: "equipment", label: "기자재비", description: "장비 구입, 임차비" },
  { id: "outsourcing", label: "외주용역비", description: "외부 용역, 위탁개발비" },
  { id: "travel", label: "여비", description: "출장비, 교통비" },
  { id: "consult", label: "전문가활용비", description: "자문료, 기술지도비" },
  { id: "ip", label: "지식재산권출원비", description: "특허, 상표 출원비" },
  { id: "indirect", label: "간접비", description: "관리비, 운영비" },
  { id: "other", label: "기타", description: "기타 비용" },
] as const

export type BudgetCategory = typeof BUDGET_CATEGORIES[number]["id"]
