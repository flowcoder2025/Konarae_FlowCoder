/**
 * 문서 유형별 AI 분석 프롬프트
 * Gemini 2.5 Pro Vision용
 */

import { DocumentType, DOCUMENT_TYPES } from "./types";

// ============================================
// 공통 프롬프트 포맷
// ============================================

const COMMON_INSTRUCTION = `
당신은 기업 문서 분석 전문가입니다.
제공된 문서를 분석하여 구조화된 정보를 추출하고, 요약 및 핵심 인사이트를 제공하세요.

**중요**:
- 응답은 반드시 JSON 형식으로 작성하세요.
- 정보가 명확하지 않으면 null 또는 빈 배열을 사용하세요.
- 추측하지 말고, 문서에 명시된 정보만 추출하세요.
- 날짜는 "YYYY-MM-DD" 형식으로 통일하세요.
`;

// ============================================
// 문서 유형별 프롬프트
// ============================================

/**
 * 사업자등록증 분석 프롬프트
 */
const BUSINESS_REGISTRATION_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 사업자등록증

**추출 정보**:
- businessNumber: 사업자등록번호 (000-00-00000 형식)
- businessName: 상호명
- representativeName: 대표자 성명
- openingDate: 개업일자 (YYYY-MM-DD)
- businessType: 업태
- businessItem: 종목
- address: 사업장 소재지

**요약**: 기업의 기본 정보를 2-3 문장으로 요약하세요.

**핵심 인사이트**: 사업 유형, 업종 특성 등 매칭에 활용 가능한 정보 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "businessNumber": "123-45-67890",
    "businessName": "주식회사 코나래",
    "representativeName": "홍길동",
    "openingDate": "2020-01-15",
    "businessType": "제조업",
    "businessItem": "소프트웨어 개발",
    "address": "서울특별시 강남구..."
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 법인등기부등본 분석 프롬프트
 */
const CORPORATION_REGISTRY_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 법인등기부등본

**추출 정보**:
- corporationNumber: 법인등록번호
- corporationName: 법인명
- establishedDate: 설립일자 (YYYY-MM-DD)
- capital: 자본금 (숫자, 단위: 원)
- executives: 임원 구성 (배열, {name, position})
- shareholders: 주주 정보 (배열, {name, shares})

**요약**: 법인의 구조 및 경영진을 2-3 문장으로 요약하세요.

**핵심 인사이트**: 자본 규모, 경영 안정성 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "corporationNumber": "110111-1234567",
    "corporationName": "주식회사 코나래",
    "establishedDate": "2020-01-10",
    "capital": 100000000,
    "executives": [
      {"name": "홍길동", "position": "대표이사"},
      {"name": "김철수", "position": "이사"}
    ],
    "shareholders": [
      {"name": "홍길동", "shares": 60},
      {"name": "김철수", "shares": 40}
    ]
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 중소기업확인서 분석 프롬프트
 */
const SME_CERTIFICATE_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 중소기업확인서

**추출 정보**:
- certificateNumber: 확인서 번호
- companySize: 기업 규모 ("small" 또는 "medium")
- issuedDate: 발급일 (YYYY-MM-DD)
- expiryDate: 유효기간 (YYYY-MM-DD)
- issuingOrganization: 발급기관

**요약**: 기업 규모 및 중소기업 자격 요약 (2-3 문장)

**핵심 인사이트**: 지원사업 자격 요건에 활용 가능한 정보 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "certificateNumber": "2024-0001-XXXX",
    "companySize": "small",
    "issuedDate": "2024-01-05",
    "expiryDate": "2024-12-31",
    "issuingOrganization": "중소벤처기업부"
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 표준재무제표증명원 분석 프롬프트
 */
const FINANCIAL_STATEMENT_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 표준재무제표증명원

**추출 정보**:
- fiscalYear: 회계연도 (숫자, 예: 2023)
- revenue: 매출액 (숫자, 단위: 원)
- operatingProfit: 영업이익 (숫자)
- netProfit: 순이익 (숫자)
- totalAssets: 총자산 (숫자)
- totalLiabilities: 총부채 (숫자)
- equity: 자본총계 (숫자)
- growthRate: 전년 대비 매출 성장률 (%) - 계산 가능한 경우만

**요약**: 재무 상태 및 성장성을 2-3 문장으로 요약하세요.

**핵심 인사이트**: 재무 건전성, 성장 추세 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "fiscalYear": 2023,
    "revenue": 5000000000,
    "operatingProfit": 500000000,
    "netProfit": 350000000,
    "totalAssets": 3000000000,
    "totalLiabilities": 1500000000,
    "equity": 1500000000,
    "growthRate": 15.2
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 고용보험 가입자 명부 분석 프롬프트
 */
const EMPLOYMENT_INSURANCE_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 고용보험 가입자 명부

**추출 정보**:
- referenceDate: 기준일 (YYYY-12-31 형식)
- totalEmployees: 총 인원 수 (숫자)
- newHires: 신규 채용 인원 (있는 경우)
- departures: 퇴사 인원 (있는 경우)
- averageTenure: 평균 근속연수 (계산 가능한 경우, 년 단위)

**요약**: 인력 규모 및 안정성을 2-3 문장으로 요약하세요.

**핵심 인사이트**: 인력 규모, 증감 추이, 안정성 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "referenceDate": "2023-12-31",
    "totalEmployees": 25,
    "newHires": 5,
    "departures": 2,
    "averageTenure": 3.5
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 수출 실적 분석 프롬프트
 */
const EXPORT_PERFORMANCE_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 수출 실적

**추출 정보**:
- fiscalYear: 회계연도 (숫자)
- totalExportAmount: 총 수출액 (숫자, 단위: USD 또는 원)
- exportCountries: 수출 국가 목록 (배열)
- mainProducts: 주요 수출 품목 (배열)

**요약**: 수출 규모 및 주요 시장을 2-3 문장으로 요약하세요.

**핵심 인사이트**: 글로벌 역량, 주요 시장, 수출 품목 특성 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "fiscalYear": 2023,
    "totalExportAmount": 2000000,
    "exportCountries": ["미국", "일본", "베트남"],
    "mainProducts": ["반도체 제조 장비", "소프트웨어 라이선스"]
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 각종 인증서 분석 프롬프트
 */
const CERTIFICATION_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 각종 인증서

**추출 정보**:
- certificationType: 인증 유형 (예: ISO, 특허, 품질인증 등)
- certificationName: 인증명
- issuingOrganization: 발급 기관
- certificationNumber: 인증 번호
- issueDate: 발급일 (YYYY-MM-DD)
- expiryDate: 만료일 (YYYY-MM-DD, 없으면 null)

**요약**: 인증 내용 및 의미를 2-3 문장으로 요약하세요.

**핵심 인사이트**: 기술 역량, 품질 수준 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "certificationType": "ISO",
    "certificationName": "ISO 9001:2015 품질경영시스템",
    "issuingOrganization": "한국표준협회",
    "certificationNumber": "KSA-2024-0001",
    "issueDate": "2024-01-10",
    "expiryDate": "2027-01-09"
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 회사 소개서 분석 프롬프트
 */
const COMPANY_INTRODUCTION_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 회사 소개서 / 홍보자료

**추출 정보**:
- coreBusinesses: 핵심 사업 분야 (배열, 최대 5개)
- mainProducts: 주요 제품/서비스 (배열, 최대 5개)
- vision: 비전
- mission: 미션
- competitiveAdvantages: 경쟁 우위 요소 (배열, 최대 3개)

**요약**: 회사의 사업 및 비전을 3-4 문장으로 요약하세요.

**핵심 인사이트**: 사업 특성, 차별화 포인트 등 사업계획서 작성에 활용 가능한 정보 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "coreBusinesses": ["AI 기반 매칭 플랫폼", "정부지원사업 컨설팅"],
    "mainProducts": ["코나래 플랫폼", "사업계획서 자동화 솔루션"],
    "vision": "중소기업과 정부지원을 연결하는 최고의 플랫폼",
    "mission": "AI로 기업의 성장을 돕는다",
    "competitiveAdvantages": ["독자 개발 AI 매칭 알고리즘", "10년 이상의 공공사업 경험"]
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 기존 사업계획서 분석 프롬프트
 */
const BUSINESS_PLAN_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 기존 사업계획서

**추출 정보**:
- projectTitle: 사업명
- objectives: 사업 목표 (배열, 최대 5개)
- strategy: 추진 전략 (문자열)
- budget: 총 사업비 (숫자, 단위: 원)
- expectedOutcomes: 기대 효과 (배열, 최대 5개)

**요약**: 사업 내용 및 목표를 3-4 문장으로 요약하세요.

**핵심 인사이트**: 계획 수립 역량, 문서 작성 패턴 등 향후 사업계획서 작성에 참고할 만한 정보 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "projectTitle": "AI 기반 스마트팩토리 구축 사업",
    "objectives": ["생산성 30% 향상", "불량률 50% 감소"],
    "strategy": "AI 비전 검사 시스템 도입 및 데이터 분석 플랫폼 구축",
    "budget": 500000000,
    "expectedOutcomes": ["매출 증대", "품질 개선", "시장 경쟁력 강화"]
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

/**
 * 특허 전문 분석 프롬프트
 */
const PATENT_PROMPT = `
${COMMON_INSTRUCTION}

**문서 유형**: 특허 전문

**추출 정보**:
- patentNumber: 특허 번호
- patentTitle: 발명의 명칭
- applicationDate: 출원일 (YYYY-MM-DD)
- registrationDate: 등록일 (YYYY-MM-DD, 미등록 시 null)
- inventors: 발명자 목록 (배열)
- technologyField: 기술 분야
- claims: 주요 청구항 (배열, 최대 3개)

**요약**: 특허의 핵심 기술 및 의미를 2-3 문장으로 요약하세요.

**핵심 인사이트**: 기술 혁신성, R&D 역량 등 (최대 3개)

**응답 형식**:
\`\`\`json
{
  "extractedData": {
    "patentNumber": "10-2024-0001234",
    "patentTitle": "AI 기반 지원사업 매칭 방법 및 시스템",
    "applicationDate": "2022-03-15",
    "registrationDate": "2024-01-10",
    "inventors": ["홍길동", "김철수"],
    "technologyField": "인공지능, 데이터 분석",
    "claims": [
      "기업 프로필과 지원사업을 벡터 임베딩하여 유사도 계산",
      "다차원 매칭 알고리즘 적용",
      "피드백 학습을 통한 정확도 향상"
    ]
  },
  "summary": "...",
  "keyInsights": ["...", "..."]
}
\`\`\`
`;

// ============================================
// 프롬프트 매핑
// ============================================

export const DOCUMENT_PROMPTS: Record<DocumentType, string> = {
  [DOCUMENT_TYPES.BUSINESS_REGISTRATION]: BUSINESS_REGISTRATION_PROMPT,
  [DOCUMENT_TYPES.CORPORATION_REGISTRY]: CORPORATION_REGISTRY_PROMPT,
  [DOCUMENT_TYPES.SME_CERTIFICATE]: SME_CERTIFICATE_PROMPT,
  [DOCUMENT_TYPES.FINANCIAL_STATEMENT]: FINANCIAL_STATEMENT_PROMPT,
  [DOCUMENT_TYPES.EMPLOYMENT_INSURANCE]: EMPLOYMENT_INSURANCE_PROMPT,
  [DOCUMENT_TYPES.EXPORT_PERFORMANCE]: EXPORT_PERFORMANCE_PROMPT,
  [DOCUMENT_TYPES.CERTIFICATION]: CERTIFICATION_PROMPT,
  [DOCUMENT_TYPES.COMPANY_INTRODUCTION]: COMPANY_INTRODUCTION_PROMPT,
  [DOCUMENT_TYPES.BUSINESS_PLAN]: BUSINESS_PLAN_PROMPT,
  [DOCUMENT_TYPES.PATENT]: PATENT_PROMPT,
};

/**
 * 문서 유형에 맞는 프롬프트 가져오기
 */
export function getPromptForDocumentType(documentType: DocumentType): string {
  return DOCUMENT_PROMPTS[documentType] || BUSINESS_REGISTRATION_PROMPT;
}
