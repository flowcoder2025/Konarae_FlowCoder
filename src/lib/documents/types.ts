/**
 * 기업 문서 관리 시스템 타입 정의
 * PDF 및 이미지 파일만 허용
 */

// ============================================
// 문서 유형 (10가지)
// ============================================

export const DOCUMENT_TYPES = {
  BUSINESS_REGISTRATION: "business_registration", // 사업자등록증
  CORPORATION_REGISTRY: "corporation_registry", // 법인등기부등본
  SME_CERTIFICATE: "sme_certificate", // 중소기업확인서
  FINANCIAL_STATEMENT: "financial_statement", // 표준재무제표증명원
  EMPLOYMENT_INSURANCE: "employment_insurance", // 고용보험 가입자 명부
  EXPORT_PERFORMANCE: "export_performance", // 수출 실적
  CERTIFICATION: "certification", // 각종 인증서
  COMPANY_INTRODUCTION: "company_introduction", // 회사 소개서/홍보자료
  BUSINESS_PLAN: "business_plan", // 기존 사업계획서
  PATENT: "patent", // 특허 전문
} as const;

export type DocumentType =
  (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

// ============================================
// 문서 메타데이터
// ============================================

export interface DocumentMetadata {
  type: DocumentType;
  label: string; // 한글 라벨
  description: string; // 설명
  icon: string; // Lucide icon name
  required: boolean; // 필수 여부
  acceptedFormats: string[]; // 허용 파일 형식
  maxSize: number; // 최대 파일 크기 (MB)
  isOnlyForCorporation?: boolean; // 법인만 해당
}

export const DOCUMENT_METADATA: Record<DocumentType, DocumentMetadata> = {
  [DOCUMENT_TYPES.BUSINESS_REGISTRATION]: {
    type: DOCUMENT_TYPES.BUSINESS_REGISTRATION,
    label: "사업자등록증",
    description: "기업 기본 정보 확인용",
    icon: "FileText",
    required: true,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.CORPORATION_REGISTRY]: {
    type: DOCUMENT_TYPES.CORPORATION_REGISTRY,
    label: "법인등기부등본",
    description: "법인 구조 및 지분 정보",
    icon: "Building2",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
    isOnlyForCorporation: true,
  },
  [DOCUMENT_TYPES.SME_CERTIFICATE]: {
    type: DOCUMENT_TYPES.SME_CERTIFICATE,
    label: "중소기업확인서",
    description: "기업 규모 확인 (매칭 자격 판단)",
    icon: "Award",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.FINANCIAL_STATEMENT]: {
    type: DOCUMENT_TYPES.FINANCIAL_STATEMENT,
    label: "표준재무제표증명원",
    description: "재무 상태 분석용",
    icon: "TrendingUp",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.EMPLOYMENT_INSURANCE]: {
    type: DOCUMENT_TYPES.EMPLOYMENT_INSURANCE,
    label: "고용보험 가입자 명부",
    description: "인력 현황 파악 (연도별 12/31 기준)",
    icon: "Users",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.EXPORT_PERFORMANCE]: {
    type: DOCUMENT_TYPES.EXPORT_PERFORMANCE,
    label: "수출 실적",
    description: "해외 사업 역량 평가",
    icon: "Globe",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.CERTIFICATION]: {
    type: DOCUMENT_TYPES.CERTIFICATION,
    label: "각종 인증서",
    description: "기술/품질 역량 증명",
    icon: "BadgeCheck",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.COMPANY_INTRODUCTION]: {
    type: DOCUMENT_TYPES.COMPANY_INTRODUCTION,
    label: "회사 소개서",
    description: "사업 내용 및 비전 파악",
    icon: "Presentation",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.BUSINESS_PLAN]: {
    type: DOCUMENT_TYPES.BUSINESS_PLAN,
    label: "기존 사업계획서",
    description: "과거 계획 및 실행 역량 평가",
    icon: "Clipboard",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
  [DOCUMENT_TYPES.PATENT]: {
    type: DOCUMENT_TYPES.PATENT,
    label: "특허 전문",
    description: "기술 역량 및 IP 자산 평가",
    icon: "Lightbulb",
    required: false,
    acceptedFormats: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    maxSize: 10,
  },
};

// ============================================
// 문서 상태
// ============================================

export const DOCUMENT_STATUS = {
  UPLOADED: "uploaded",
  ANALYZING: "analyzing",
  ANALYZED: "analyzed",
  FAILED: "failed",
} as const;

export type DocumentStatus =
  (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

// ============================================
// 허용 파일 타입 (MIME)
// ============================================

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ============================================
// 분석 결과 스키마 (문서 유형별)
// ============================================

// 사업자등록증
export interface BusinessRegistrationData {
  businessNumber: string;
  businessName: string;
  representativeName: string;
  openingDate: string;
  businessType: string;
  businessItem: string;
  address: string;
}

// 법인등기부등본
export interface CorporationRegistryData {
  corporationNumber: string;
  corporationName: string;
  establishedDate: string;
  capital: number;
  executives: Array<{ name: string; position: string }>;
  shareholders: Array<{ name: string; shares: number }>;
}

// 중소기업확인서
export interface SmeCertificateData {
  certificateNumber: string;
  companySize: "small" | "medium";
  issuedDate: string;
  expiryDate: string;
  issuingOrganization: string;
}

// 표준재무제표증명원
export interface FinancialStatementData {
  fiscalYear: number;
  revenue: number;
  operatingProfit: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  growthRate?: number;
}

// 고용보험 가입자 명부
export interface EmploymentInsuranceData {
  referenceDate: string; // "YYYY-12-31"
  totalEmployees: number;
  newHires?: number;
  departures?: number;
  averageTenure?: number;
}

// 수출 실적
export interface ExportPerformanceData {
  fiscalYear: number;
  totalExportAmount: number;
  exportCountries: string[];
  mainProducts: string[];
}

// 각종 인증서
export interface CertificationData {
  certificationType: string;
  certificationName: string;
  issuingOrganization: string;
  certificationNumber: string;
  issueDate: string;
  expiryDate?: string;
}

// 회사 소개서
export interface CompanyIntroductionData {
  coreBusinesses: string[];
  mainProducts: string[];
  vision: string;
  mission: string;
  competitiveAdvantages: string[];
}

// 기존 사업계획서
export interface BusinessPlanData {
  projectTitle: string;
  objectives: string[];
  strategy: string;
  budget: number;
  expectedOutcomes: string[];
}

// 특허 전문
export interface PatentData {
  patentNumber: string;
  patentTitle: string;
  applicationDate: string;
  registrationDate?: string;
  inventors: string[];
  technologyField: string;
  claims: string[];
}

// 통합 타입
export type ExtractedData =
  | BusinessRegistrationData
  | CorporationRegistryData
  | SmeCertificateData
  | FinancialStatementData
  | EmploymentInsuranceData
  | ExportPerformanceData
  | CertificationData
  | CompanyIntroductionData
  | BusinessPlanData
  | PatentData;

// ============================================
// API 요청/응답 타입
// ============================================

export interface UploadDocumentRequest {
  companyId: string;
  documentType: DocumentType;
  file: File;
}

export interface UploadDocumentResponse {
  documentId: string;
  fileUrl: string;
  status: DocumentStatus;
}

export interface DocumentAnalysisResult {
  documentId: string;
  extractedData: ExtractedData;
  summary: string;
  keyInsights: string[];
  confidenceScore: number;
}

export interface DocumentListItem {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fileSize: number;
  status: DocumentStatus;
  uploadedAt: Date;
  analyzedAt?: Date;
  version: number;
}
