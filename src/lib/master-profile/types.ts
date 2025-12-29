/**
 * 마스터 프로필 시스템 타입 정의
 */

import type { Prisma } from "@prisma/client"

// ============================================
// 블록 카테고리 타입
// ============================================

export type ProfileBlockCategory =
  | "company_overview" // 회사 개요
  | "business_description" // 사업 내용
  | "financials" // 재무 현황
  | "human_resources" // 인력 현황
  | "certifications" // 인증 현황
  | "achievements" // 실적/성과
  | "capabilities" // 핵심 역량
  | "market_position" // 시장 포지션

export type ProfileBlockContentType =
  | "markdown"
  | "table"
  | "list"
  | "keyvalue"

export type MasterProfileStatus =
  | "draft"
  | "generating"
  | "completed"
  | "failed"

export type ExpectedQuality = "low" | "medium" | "high" | "excellent"

// ============================================
// 블록 메타데이터 타입
// ============================================

export interface ProfileBlockMetadata {
  /** 원본 문서에서 추출된 핵심 키워드 */
  keywords?: string[]
  /** AI 신뢰도 점수 (0-1) */
  confidenceScore?: number
  /** 추가 컨텍스트 정보 */
  context?: string
  /** 원본 문서 분석 날짜 */
  analyzedAt?: string
}

// ============================================
// API 요청/응답 타입
// ============================================

export interface GenerateMasterProfileRequest {
  companyId: string
}

export interface GenerateMasterProfileResponse {
  success: boolean
  profileId?: string
  error?: string
  requiredCredit?: number
  isFirstGeneration?: boolean
}

export interface UpdateProfileBlockRequest {
  title?: string
  content?: string
  contentType?: ProfileBlockContentType
  metadata?: ProfileBlockMetadata
}

export interface MasterProfileWithBlocks {
  id: string
  companyId: string
  status: MasterProfileStatus
  version: number
  generatedFromDocuments: string[]
  analyzedDocumentCount: number
  confidenceScore: number | null
  creditUsed: number
  isFreeGeneration: boolean
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  blocks: ProfileBlockWithMeta[]
}

export interface ProfileBlockWithMeta {
  id: string
  profileId: string
  category: ProfileBlockCategory
  title: string
  blockOrder: number
  content: string
  contentType: ProfileBlockContentType
  metadata: ProfileBlockMetadata
  sourceDocumentIds: string[]
  sourceDocumentTypes: string[]
  isAiGenerated: boolean
  isEdited: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ============================================
// AI 생성 관련 타입
// ============================================

export interface DocumentAnalysisInput {
  documentId: string
  documentType: string
  extractedData: Prisma.JsonValue
  summary: string
  keyInsights: string[]
}

export interface GeneratedBlock {
  category: ProfileBlockCategory
  title: string
  blockOrder: number
  content: string
  contentType: ProfileBlockContentType
  metadata: ProfileBlockMetadata
  sourceDocumentIds: string[]
  sourceDocumentTypes: string[]
}

export interface BlockGenerationResult {
  blocks: GeneratedBlock[]
  confidenceScore: number
  processingTime: number
}

// ============================================
// UI 컴포넌트 Props 타입
// ============================================

export interface MasterProfileCTAProps {
  companyId: string
  analyzedDocumentCount: number
  hasExistingProfile: boolean
  isFreeGeneration: boolean
  currentBalance: number
}

export interface ProfileBlockCardProps {
  block: ProfileBlockWithMeta
  onEdit: (blockId: string) => void
  onDelete: (blockId: string) => void
  isEditing?: boolean
}

export interface BlockPickerModalProps {
  companyId: string
  isOpen: boolean
  onClose: () => void
  onSelect: (blocks: ProfileBlockWithMeta[]) => void
  categoryFilter?: ProfileBlockCategory
}

// ============================================
// 문서 업로드 상태 타입 (CTA 조건 체크용)
// ============================================

export interface DocumentUploadStatus {
  /** 필수 문서 업로드 여부 */
  hasRequiredDocuments: boolean
  /** 분석 완료된 문서 수 */
  analyzedCount: number
  /** 총 업로드 문서 수 */
  totalCount: number
  /** 문서 유형별 현황 */
  byType: Record<string, { uploaded: boolean; analyzed: boolean }>
  /** 마스터 프로필 생성 가능 여부 */
  canGenerateProfile: boolean
  /** 생성 불가 사유 (있는 경우) */
  blockerReason?: string
}
