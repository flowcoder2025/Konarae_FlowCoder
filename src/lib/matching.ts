/**
 * Matching Algorithm (PRD 6.2) - v3 Qualification-First
 *
 * 3-Stage Pipeline:
 * [Stage 1] Hard Disqualify: confidence="high" eligibilityCriteria → pass/fail
 * [Stage 2] Soft Penalty: confidence="medium" → score deduction
 * [Stage 3] Qualification Score: weighted scoring
 *
 * v3 가중치 (Qualification-First):
 * - eligibility (40%): 자격 요건 (인증, 기업 유형, 규모 등)
 * - category (20%): 업종 적합도
 * - semantic (25%): RAG 유사도 (보너스)
 * - document (15%): 문서 벡터 유사도 (보너스)
 *
 * v3 변경사항:
 * - Hard disqualification based on structured eligibilityCriteria
 * - Qualification-first weight inversion (eligibility > semantic)
 * - Profile quality gating (thin profiles → semantic weight reduced)
 * - Score scaling removed (raw scores used)
 */

import { hybridSearch } from "./rag";
import { prisma } from "./prisma";
import { createLogger } from "./logger";
import { Prisma } from "@prisma/client";
import {
  extractRegionFromAddress,
  extractSubRegionFromAddress,
  isRegionMatch,
} from "./region";
import type { EligibilityCriteria } from "./crawler/project-analyzer";

const logger = createLogger({ module: "matching" });

// v3: Qualification-First weights
const MATCHING_WEIGHTS = {
  eligibility: 0.40,       // 자격 요건 (주 점수)
  category: 0.20,          // 업종 적합도
  semantic: 0.25,          // RAG 유사도 (보너스)
  document: 0.15,          // 문서 벡터 유사도 (보너스)
} as const;

// v3: Weights for thin profiles (semantic is unreliable)
const THIN_PROFILE_WEIGHTS = {
  eligibility: 0.60,
  category: 0.40,
  semantic: 0.00,
  document: 0.00,
} as const;

// Minimum profile text length for semantic scoring to be meaningful
const MIN_PROFILE_LENGTH = 30;


/**
 * [Stage 1] Hard Disqualification Check
 * Returns disqualify reasons if company fails high-confidence criteria.
 * Returns empty array if company passes (or data is missing).
 */
export function checkHardDisqualification(
  criteria: EligibilityCriteria | null | undefined,
  company: {
    establishedDate?: Date | null;
    address?: string | null;
    companySize?: string | null;
    companyType?: string;
    isVenture?: boolean;
    isInnoBiz?: boolean;
    isMainBiz?: boolean;
    annualRevenue?: bigint | null;
    employeeCount?: number | null;
    businessCategory?: string | null;
    certifications?: Array<{ certificationType: string; certificationName: string }>;
  }
): string[] {
  if (!criteria || typeof criteria !== "object") return [];

  const reasons: string[] = [];

  // 1. Company age check (업력)
  if (criteria.maxCompanyAge?.confidence === "high" && company.establishedDate) {
    const ageYears = (Date.now() - new Date(company.establishedDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const maxAge = criteria.maxCompanyAge.value as number;
    if (ageYears > maxAge) {
      reasons.push(`업력 ${maxAge}년 이내 조건 미충족 (현재 약 ${Math.floor(ageYears)}년)`);
    }
  }
  if (criteria.minCompanyAge?.confidence === "high" && company.establishedDate) {
    const ageYears = (Date.now() - new Date(company.establishedDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const minAge = criteria.minCompanyAge.value as number;
    if (ageYears < minAge) {
      reasons.push(`업력 ${minAge}년 이상 조건 미충족 (현재 약 ${Math.floor(ageYears)}년)`);
    }
  }

  // 2. Region check (지역)
  if (criteria.requiredRegions?.confidence === "high" && company.address) {
    const companyRegion = extractRegionFromAddress(company.address);
    const requiredValues = criteria.requiredRegions.value as string[];
    const regionType = (criteria.requiredRegions as { type?: string }).type;

    if (companyRegion && requiredValues.length > 0) {
      if (regionType === "exclude") {
        // 제외 지역에 해당하면 탈락
        if (requiredValues.some(r => companyRegion.includes(r) || r.includes(companyRegion))) {
          reasons.push(`${requiredValues.join(", ")} 소재 기업 제외 대상`);
        }
      } else {
        // 포함 지역에 해당하지 않으면 탈락
        if (!requiredValues.some(r => companyRegion.includes(r) || r.includes(companyRegion))) {
          reasons.push(`${requiredValues.join(", ")} 소재 기업만 지원 가능`);
        }
      }
    }
  }

  // 3. Required certifications check (필수 인증서)
  if (criteria.requiredCerts?.confidence === "high") {
    const requiredCerts = criteria.requiredCerts.value as string[];
    for (const cert of requiredCerts) {
      const certLower = cert.toLowerCase();
      const hasCert =
        (certLower.includes("벤처") && company.isVenture) ||
        (certLower.includes("이노비즈") && company.isInnoBiz) ||
        (certLower.includes("메인비즈") && company.isMainBiz) ||
        company.certifications?.some(
          c => c.certificationType.includes(cert) || c.certificationName.includes(cert)
        );

      if (!hasCert) {
        reasons.push(`${cert} 인증 필수 (미보유)`);
      }
    }
  }

  // 4. Revenue check (매출)
  if (criteria.maxRevenue?.confidence === "high" && company.annualRevenue) {
    const maxRev = criteria.maxRevenue.value as number;
    if (Number(company.annualRevenue) > maxRev) {
      reasons.push(`매출 ${(maxRev / 100000000).toFixed(0)}억원 이하 조건 미충족`);
    }
  }

  // 5. Employee count check
  if (criteria.maxEmployees?.confidence === "high" && company.employeeCount) {
    const maxEmp = criteria.maxEmployees.value as number;
    if (company.employeeCount > maxEmp) {
      reasons.push(`종업원 ${maxEmp}인 이하 조건 미충족 (현재 ${company.employeeCount}인)`);
    }
  }

  return reasons;
}

/**
 * [Stage 2] Soft Penalty for medium-confidence criteria
 * Returns a penalty multiplier (0.0 to 1.0, where 1.0 = no penalty)
 */
export function calculateSoftPenalty(
  criteria: EligibilityCriteria | null | undefined,
  company: {
    establishedDate?: Date | null;
    businessCategory?: string | null;
    mainBusiness?: string | null;
    businessItems?: string[];
  }
): { multiplier: number; warnings: string[] } {
  if (!criteria || typeof criteria !== "object") return { multiplier: 1.0, warnings: [] };

  const warnings: string[] = [];
  let penalty = 0;

  // Medium-confidence industry restriction
  if (criteria.industryRestriction?.confidence === "medium") {
    const industries = criteria.industryRestriction.value as string[];
    const restrictionType = (criteria.industryRestriction as { type?: string }).type;
    const companyBiz = [company.businessCategory, company.mainBusiness, ...(company.businessItems || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (restrictionType === "include" && industries.length > 0) {
      const matches = industries.some(ind => companyBiz.includes(ind.toLowerCase()));
      if (!matches) {
        penalty += 0.3;
        warnings.push(`업종 조건 확인 필요: ${industries.join(", ")}`);
      }
    }
  }

  // Medium-confidence company age
  if (criteria.maxCompanyAge?.confidence === "medium" && company.establishedDate) {
    const ageYears = (Date.now() - new Date(company.establishedDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const maxAge = criteria.maxCompanyAge.value as number;
    if (ageYears > maxAge) {
      penalty += 0.2;
      warnings.push(`업력 조건 확인 필요: ${maxAge}년 이내`);
    }
  }

  // Medium-confidence certifications
  if (criteria.requiredCerts?.confidence === "medium") {
    const certs = criteria.requiredCerts.value as string[];
    warnings.push(`인증 우대: ${certs.join(", ")}`);
    // No penalty for medium-confidence certs (just a warning)
  }

  return {
    multiplier: Math.max(0.5, 1.0 - penalty),
    warnings,
  };
}

export interface MatchingInput {
  companyId: string;
  userId: string;
  preferences?: {
    categories?: string[];
    minAmount?: bigint;
    maxAmount?: bigint;
    regions?: string[]; // 광역시·도 (17개)
    subRegions?: string[]; // 시·군·구
    excludeKeywords?: string[];
  };
}

export interface MatchingScore {
  totalScore: number;
  businessSimilarityScore: number; // 사업 유사도 (텍스트 + 문서 벡터 통합)
  categoryScore: number; // 관심 분야 일치도 (사용자 선호도 vs 프로젝트 카테고리)
  eligibilityScore: number; // 자격 요건 (인증, 기업 유형 등)
  confidence: "high" | "medium" | "low";
  matchReasons: string[];
}

export interface MatchingResultData extends MatchingScore {
  projectId: string;
  disqualified: boolean;
  disqualifyReasons: string[];
  project: {
    id: string;
    name: string;
    organization: string;
    category: string;
    summary: string;
    deadline?: Date | null;
    amountMin?: bigint | null;
    amountMax?: bigint | null;
  };
}

/**
 * Calculate semantic scores for all projects in batch using RAG hybrid search
 * Optimized: Single API call instead of N calls
 */
async function calculateSemanticScoresBatch(
  companyProfile: string,
  projectIds: string[]
): Promise<Map<string, number>> {
  try {
    // Batch search with matchCount limited to reasonable size
    const matchCount = Math.min(projectIds.length, 100);

    const results = await hybridSearch({
      queryText: companyProfile,
      sourceType: "support_project",
      matchThreshold: 0.35, // Balanced threshold for relevant matches
      matchCount,
      semanticWeight: 0.7, // Balanced weight between semantic and keyword
    });

    // Create Map for O(1) lookup
    const scoreMap = new Map<string, number>();

    for (const result of results) {
      // Only include projects we're interested in
      if (projectIds.includes(result.sourceId)) {
        scoreMap.set(
          result.sourceId,
          Math.round(result.combinedScore * 100)
        );
      }
    }

    return scoreMap;
  } catch (error) {
    logger.error("Batch semantic score error", { error });
    return new Map(); // Return empty map on error
  }
}

/**
 * Calculate document similarity scores between company documents and support projects
 * CompanyDocumentEmbedding ↔ document_embeddings (support_project) 벡터 유사도
 * Optimized: Batch calculation using pgvector
 */
async function calculateDocumentSimilarityScoresBatch(
  companyId: string,
  projectIds: string[]
): Promise<Map<string, number>> {
  try {
    if (projectIds.length === 0) {
      return new Map();
    }

    // 기업 문서 임베딩이 있는지 먼저 확인
    const companyEmbeddingCount = await prisma.companyDocumentEmbedding.count({
      where: {
        document: {
          companyId,
          deletedAt: null,
        },
      },
    });

    if (companyEmbeddingCount === 0) {
      logger.debug("No document embeddings for company, skipping document similarity", {
        companyId,
      });
      return new Map();
    }

    // SQL로 기업 문서 임베딩과 지원사업 임베딩 간 유사도 계산
    // 각 지원사업에 대해 가장 높은 유사도를 반환
    // Memory Optimization (2025.01): LIMIT 축소로 CROSS JOIN 연산량 감소
    const results: Array<{
      project_id: string;
      max_similarity: number;
      avg_similarity: number;
    }> = await prisma.$queryRaw`
      WITH company_embeddings AS (
        SELECT cde.embedding
        FROM "CompanyDocumentEmbedding" cde
        INNER JOIN "CompanyDocument" cd ON cd.id = cde."documentId"
        WHERE cd."companyId" = ${companyId}
          AND cd."deletedAt" IS NULL
        LIMIT 20
      ),
      project_similarities AS (
        SELECT
          de.source_id as project_id,
          MAX(1 - (ce.embedding <=> de.embedding)) as max_similarity,
          AVG(1 - (ce.embedding <=> de.embedding)) as avg_similarity
        FROM document_embeddings de
        CROSS JOIN company_embeddings ce
        WHERE de.source_type = 'support_project'
          AND de.source_id = ANY(${projectIds}::text[])
        GROUP BY de.source_id
      )
      SELECT
        project_id,
        max_similarity,
        avg_similarity
      FROM project_similarities
      WHERE max_similarity > 0.3
      ORDER BY max_similarity DESC
      LIMIT 50
    `;

    const scoreMap = new Map<string, number>();

    for (const row of results) {
      // 최대 유사도와 평균 유사도의 가중 평균 사용 (최대에 더 높은 가중치)
      const combinedSimilarity = row.max_similarity * 0.7 + row.avg_similarity * 0.3;
      const score = Math.round(combinedSimilarity * 100);
      scoreMap.set(row.project_id, Math.min(score, 100));
    }

    logger.debug("Document similarity calculated", {
      matchedProjects: scoreMap.size,
      totalProjects: projectIds.length,
    });

    return scoreMap;
  } catch (error) {
    logger.error("Document similarity score error", { error, companyId });
    return new Map();
  }
}

/**
 * Calculate category/industry match score (v2)
 * 기업의 업종(businessInfo)과 프로젝트의 대상/자격요건(target/eligibility)의 연관성 비교
 *
 * @param companyBusinessInfo - 기업의 업종 관련 정보 (businessCategory, mainBusiness, businessItems)
 * @param projectTarget - 프로젝트의 지원 대상 (e.g., "IT/SW 기업", "제조업 중소기업")
 * @param projectEligibility - 프로젝트의 자격 요건 (e.g., "소프트웨어 개발 기업 우대")
 */
export function calculateCategoryScore(
  companyBusinessInfo: string[],
  projectTarget: string,
  projectEligibility?: string | null,
  projectName?: string | null
): number {
  // 기업 업종 정보가 없으면 기본 점수
  if (!companyBusinessInfo || companyBusinessInfo.length === 0) {
    return 50;
  }

  let score = 0;

  // 프로젝트 대상 및 자격 요건을 하나의 텍스트로 결합
  const targetText = `${projectTarget} ${projectEligibility || ""}`.toLowerCase();
  const projectNameLower = (projectName || "").toLowerCase();

  // 대상이 일반적인지 확인 (중소기업, 창업기업 등)
  const isGenericTarget =
    targetText.trim() === "중소기업" ||
    targetText.trim() === "창업기업" ||
    targetText.trim() === "중소·중견기업" ||
    targetText.trim() === "예비창업자" ||
    targetText.includes("전업종") ||
    targetText.includes("업종무관") ||
    targetText.includes("업종 무관");

  // 업종 관련 키워드 매핑 (기업 업종 → 프로젝트 관련 키워드)
  const industryKeywordMap: Record<string, string[]> = {
    // IT/SW 관련
    소프트웨어: ["sw", "소프트웨어", "it", "정보통신", "디지털", "스마트", "ai", "데이터", "ax"],
    "it서비스": ["it", "정보통신", "sw", "소프트웨어", "디지털", "플랫폼"],
    정보통신: ["it", "정보통신", "sw", "소프트웨어", "ict"],
    플랫폼: ["플랫폼", "it", "디지털", "sw"],
    ai: ["ai", "인공지능", "데이터", "it", "sw", "ax", "디지털"],

    // 제조업 관련
    제조: ["제조", "생산", "부품", "산업", "공장", "스마트공장"],
    생산: ["제조", "생산", "공정"],
    기계: ["기계", "제조", "장비", "설비"],
    전자: ["전자", "반도체", "부품", "it"],

    // 바이오/헬스케어
    바이오: ["바이오", "의료", "헬스케어", "생명", "그린바이오"],
    의료: ["의료", "바이오", "헬스케어", "건강"],
    헬스케어: ["헬스케어", "의료", "바이오", "건강"],

    // 기타
    디자인: ["디자인", "콘텐츠", "창작", "문화"],
    콘텐츠: ["콘텐츠", "디자인", "문화", "미디어"],
    서비스: ["서비스", "플랫폼"],
    자동화: ["자동화", "ai", "ax", "디지털", "스마트"],
  };

  // 검색할 텍스트 (대상이 일반적이면 프로젝트 이름도 포함)
  const searchText = isGenericTarget
    ? `${targetText} ${projectNameLower}`
    : targetText;

  // 각 기업 업종 정보에 대해 점수 계산
  for (const bizInfo of companyBusinessInfo) {
    if (!bizInfo) continue;
    const bizLower = bizInfo.toLowerCase();

    // 1. 직접 매칭 (프로젝트에 기업 업종이 직접 언급됨)
    if (searchText.includes(bizLower)) {
      score = Math.max(score, 80);
      continue;
    }

    // 2. 키워드 매핑 매칭
    for (const [industry, keywords] of Object.entries(industryKeywordMap)) {
      if (bizLower.includes(industry)) {
        const matchCount = keywords.filter((kw) => searchText.includes(kw)).length;
        if (matchCount >= 2) {
          score = Math.max(score, 70);
        } else if (matchCount === 1) {
          score = Math.max(score, 50);
        }
      }
    }

    // 3. 부분 문자열 매칭 (기업 업종의 일부가 포함됨)
    const bizParts = bizLower.split(/[\s,\/]+/).filter((p) => p.length >= 2);
    for (const part of bizParts) {
      if (searchText.includes(part)) {
        score = Math.max(score, 60);
        break;
      }
    }
  }

  // 4. 전체 업종 무관 (모든 업종 지원) 체크 - 최소 점수 보장
  if (isGenericTarget && score === 0) {
    score = 50; // 업종 무관인 경우 중립 점수
  }

  return Math.min(score, 100);
}

/**
 * Calculate eligibility score
 * Enhanced: 실제 인증서 정보(CompanyCertification) 활용
 */
export function calculateEligibilityScore(
  company: {
    companyType: string;
    companySize?: string | null;
    isVenture: boolean;
    isInnoBiz: boolean;
    isMainBiz: boolean;
    employeeCount?: number | null;
    annualRevenue?: bigint | null;
    // Enhanced: 실제 인증서 정보
    certifications?: Array<{
      certificationType: string;
      certificationName: string;
      issuingOrganization: string;
    }>;
  },
  project: {
    target: string;
    eligibility?: string | null;
  }
): { score: number; reasons: string[] } {
  let score = 50; // Base score
  const reasons: string[] = [];

  const target = project.target.toLowerCase();
  const eligibility = project.eligibility?.toLowerCase() || "";
  const combinedCriteria = `${target} ${eligibility}`;

  // Company type match
  if (target.includes("중소기업") || target.includes("sme")) {
    if (company.companyType.includes("중소")) {
      score += 20;
      reasons.push("중소기업 대상 사업");
    }
  }

  // Venture certification (Boolean 플래그 + 실제 인증서 확인)
  const hasVentureCert =
    company.isVenture ||
    company.certifications?.some(
      (c) =>
        c.certificationType.includes("벤처") ||
        c.certificationName.includes("벤처")
    );
  if (
    (target.includes("벤처") || eligibility.includes("벤처")) &&
    hasVentureCert
  ) {
    score += 15;
    reasons.push("벤처기업 인증 보유");
  }

  // InnoBiz certification
  const hasInnoBizCert =
    company.isInnoBiz ||
    company.certifications?.some(
      (c) =>
        c.certificationType.includes("이노비즈") ||
        c.certificationName.includes("이노비즈")
    );
  if (
    (target.includes("이노비즈") || eligibility.includes("이노비즈")) &&
    hasInnoBizCert
  ) {
    score += 10;
    reasons.push("이노비즈 인증 보유");
  }

  // MainBiz certification
  const hasMainBizCert =
    company.isMainBiz ||
    company.certifications?.some(
      (c) =>
        c.certificationType.includes("메인비즈") ||
        c.certificationName.includes("메인비즈")
    );
  if (
    (target.includes("메인비즈") || eligibility.includes("메인비즈")) &&
    hasMainBizCert
  ) {
    score += 10;
    reasons.push("메인비즈 인증 보유");
  }

  // Enhanced: 추가 인증서 매칭 (ISO, 특허, 인정 등)
  if (company.certifications && company.certifications.length > 0) {
    // ISO 인증 관련
    if (combinedCriteria.includes("iso") || combinedCriteria.includes("품질")) {
      const hasIsoCert = company.certifications.some(
        (c) =>
          c.certificationName.includes("ISO") ||
          c.certificationType.includes("ISO")
      );
      if (hasIsoCert) {
        score += 10;
        reasons.push("ISO 인증 보유");
      }
    }

    // 특허/지식재산권 관련
    if (
      combinedCriteria.includes("특허") ||
      combinedCriteria.includes("지식재산")
    ) {
      const hasPatentCert = company.certifications.some(
        (c) =>
          c.certificationType.includes("특허") ||
          c.certificationName.includes("특허")
      );
      if (hasPatentCert) {
        score += 10;
        reasons.push("특허 보유");
      }
    }

    // 기술혁신형 기업 관련
    if (
      combinedCriteria.includes("기술혁신") ||
      combinedCriteria.includes("기술개발")
    ) {
      const hasTechCert = company.certifications.some(
        (c) =>
          c.certificationType.includes("기술") ||
          c.certificationName.includes("혁신")
      );
      if (hasTechCert) {
        score += 5;
        reasons.push("기술 관련 인증 보유");
      }
    }
  }

  // Employee count criteria
  if (
    company.employeeCount &&
    (eligibility.includes("인원") || eligibility.includes("직원"))
  ) {
    score += 5;
  }

  return { score: Math.min(score, 100), reasons };
}

/**
 * Calculate overall confidence level
 * Adjusted thresholds based on realistic score distributions:
 * - Semantic similarity rarely exceeds 0.5-0.6
 * - Typical high-quality match: 50-65 points
 */
function calculateConfidence(
  totalScore: number
): "high" | "medium" | "low" {
  if (totalScore >= 60) return "high";
  if (totalScore >= 45) return "medium";
  return "low";
}

/**
 * Execute matching for a company
 * Enhanced: 기업 문서 분석 결과 및 인증서 정보 활용
 */
export async function executeMatching(
  input: MatchingInput
): Promise<MatchingResultData[]> {
  try {
    // Get company data with related documents and certifications
    const company = await prisma.company.findUnique({
      where: { id: input.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        address: true,
        establishedDate: true, // v3: hard disqualification check
        companyType: true,
        companySize: true,
        businessCategory: true,
        mainBusiness: true,
        businessItems: true,
        isVenture: true,
        isInnoBiz: true,
        isMainBiz: true,
        isSocial: true,
        employeeCount: true,
        annualRevenue: true,
        introduction: true,
        vision: true,
        mission: true,
        // 기업 문서 및 분석 결과 조회
        documents: {
          where: { deletedAt: null, status: "analyzed" },
          select: {
            documentType: true,
            analysis: {
              select: {
                summary: true,
                keyInsights: true,
              },
            },
          },
          take: 10,
        },
        // 활성 인증서 조회
        certifications: {
          where: { isActive: true },
          select: {
            certificationType: true,
            certificationName: true,
            issuingOrganization: true,
          },
          take: 10,
        },
        // 최신 재무정보 조회
        financials: {
          orderBy: { fiscalYear: "desc" },
          select: {
            fiscalYear: true,
            revenue: true,
            operatingProfit: true,
          },
          take: 1,
        },
      },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Build enhanced company profile for semantic search
    // 1. 기본 정보
    const baseProfile = [
      company.name,
      company.businessCategory,
      company.mainBusiness,
      ...(company.businessItems || []),
      company.introduction,
      company.vision,
      company.mission,
    ];

    // 2. 문서 분석 결과 (CompanyDocumentAnalysis 활용)
    const documentSummaries = company.documents
      .filter((doc) => doc.analysis?.summary)
      .map((doc) => {
        const insights = doc.analysis?.keyInsights?.join(", ") || "";
        return `${doc.documentType}: ${doc.analysis?.summary} ${insights}`;
      });

    // 3. 인증서 정보 (CompanyCertification 활용)
    const certificationInfo = company.certifications.map(
      (cert) =>
        `${cert.certificationType} ${cert.certificationName} (${cert.issuingOrganization})`
    );

    // 4. 재무 정보 요약 (선택적)
    const financialInfo =
      company.financials[0] && company.financials[0].revenue
        ? `연매출 ${Number(company.financials[0].revenue).toLocaleString()}원`
        : "";

    // 통합 프로필 생성
    const companyProfile = [
      ...baseProfile,
      ...documentSummaries,
      ...certificationInfo,
      financialInfo,
    ]
      .filter(Boolean)
      .join(" ");

    // 기업 주소에서 지역 코드 추출 (v3: 자동 지역 필터링)
    const companyRegion = extractRegionFromAddress(company.address);
    // v4: 시·군·구 추출 (세부 지역 필터링)
    const companySubRegion = extractSubRegionFromAddress(company.address);

    logger.debug("Enhanced profile built", {
      companyName: company.name,
      companyAddress: company.address,
      companyRegion,
      companySubRegion,
      documentCount: company.documents.length,
      certificationCount: company.certifications.length,
    });

    // Get active projects
    const whereClause: Prisma.SupportProjectWhereInput = {
      deletedAt: null,
      status: "active",
    };

    // Apply preferences
    if (input.preferences) {
      if (input.preferences.categories?.length) {
        whereClause.category = { in: input.preferences.categories };
      }

      // v3: 명시적 regions 설정이 있으면 사용, 없으면 기업 주소 기반 필터링
      if (input.preferences.regions?.length) {
        whereClause.region = { in: input.preferences.regions };
      }

      // v4: subRegions 필터링 (시·군·구)
      if (input.preferences.subRegions?.length) {
        whereClause.subRegion = { in: input.preferences.subRegions };
      }

      // Exclude keywords
      if (input.preferences.excludeKeywords?.length) {
        whereClause.NOT = {
          OR: input.preferences.excludeKeywords.map((keyword) => ({
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { summary: { contains: keyword, mode: "insensitive" } },
            ],
          })),
        };
      }
    }

    // Memory Optimization (2025.01): 프로젝트 로드 개수 축소 200 → 100
    const projects = await prisma.supportProject.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        subCategory: true,
        region: true,
        subRegion: true,
        target: true,
        eligibility: true,
        eligibilityCriteria: true, // v3: structured criteria for hard filter
        amountMin: true,
        amountMax: true,
        deadline: true,
        isPermanent: true,
        summary: true,
      },
      take: 100,
    });

    // v3: 지역 필터링 적용 (preferences.regions가 없을 때 자동 필터링)
    // - "전국" 사업은 항상 포함
    // - 기업 지역과 일치하는 지역 사업만 포함
    let filteredProjects = !input.preferences?.regions?.length && companyRegion
      ? projects.filter((p) => isRegionMatch(companyRegion, p.region))
      : projects;

    // v4: subRegion 자동 필터링 (preferences.subRegions가 없을 때)
    // - 기업 시·군·구와 일치하거나 subRegion이 null인 사업 포함 (전체 지역 대상)
    if (!input.preferences?.subRegions?.length && companySubRegion) {
      filteredProjects = filteredProjects.filter((p) => {
        // subRegion이 없으면 전체 지역 대상으로 간주 → 포함
        if (!p.subRegion) return true;
        // 기업 subRegion과 일치하면 포함
        return p.subRegion.includes(companySubRegion);
      });
    }

    logger.debug("Region filtering applied", {
      originalCount: projects.length,
      filteredCount: filteredProjects.length,
      companyRegion,
      companySubRegion,
      hasExplicitRegionPreference: !!input.preferences?.regions?.length,
      hasExplicitSubRegionPreference: !!input.preferences?.subRegions?.length,
    });

    // v3: Determine profile quality for weight selection
    const profileLength = companyProfile.length;
    const isThinProfile = profileLength < MIN_PROFILE_LENGTH;
    const weights = isThinProfile ? THIN_PROFILE_WEIGHTS : MATCHING_WEIGHTS;

    if (isThinProfile) {
      logger.info("Thin profile detected, using qualification-only weights", {
        profileLength,
        companyName: company.name,
      });
    }

    // Calculate scores for each project
    const results: MatchingResultData[] = [];

    const projectIds = filteredProjects.map((p) => p.id);

    // Only compute semantic scores if profile is thick enough
    let semanticScoreMap: Map<string, number> | null = isThinProfile
      ? new Map()
      : await calculateSemanticScoresBatch(companyProfile, projectIds);
    let documentSimilarityScoreMap: Map<string, number> | null = isThinProfile
      ? new Map()
      : await calculateDocumentSimilarityScoresBatch(company.id, projectIds);

    for (const project of filteredProjects) {
      // [Stage 1] Hard Disqualification - confidence="high" criteria
      const criteria = project.eligibilityCriteria as EligibilityCriteria | null;
      const disqualifyReasons = checkHardDisqualification(criteria, company);

      if (disqualifyReasons.length > 0) {
        // Disqualified: include in results but flagged (so user can see why)
        results.push({
          projectId: project.id,
          disqualified: true,
          disqualifyReasons,
          project: {
            id: project.id,
            name: project.name,
            organization: project.organization,
            category: project.category,
            summary: project.summary,
            deadline: project.deadline,
            amountMin: project.amountMin,
            amountMax: project.amountMax,
          },
          totalScore: 0,
          businessSimilarityScore: 0,
          categoryScore: 0,
          eligibilityScore: 0,
          confidence: "low",
          matchReasons: disqualifyReasons,
        });
        continue;
      }

      // [Stage 2] Soft Penalty - confidence="medium" criteria
      const { multiplier: softMultiplier, warnings } = calculateSoftPenalty(criteria, company);

      // Semantic score (RAG hybrid search)
      const semanticScore = semanticScoreMap!.get(project.id) || 0;

      // Document vector similarity
      const documentSimilarityScore = documentSimilarityScoreMap!.get(project.id) || 0;

      // v3: Combined business similarity score (no scaling - raw scores)
      const businessSimilarityScore = documentSimilarityScore > 0
        ? Math.round(semanticScore * 0.6 + documentSimilarityScore * 0.4)
        : semanticScore;

      // Category score
      const categoryScore = calculateCategoryScore(
        [
          company.businessCategory,
          company.mainBusiness,
          ...(company.businessItems || []),
        ].filter(Boolean) as string[],
        project.target,
        project.eligibility,
        project.name
      );

      // Eligibility score
      const { score: eligibilityScore, reasons: eligibilityReasons } =
        calculateEligibilityScore(company, project);

      // v3: Qualification-First weighted total
      const rawTotal = Math.round(
        eligibilityScore * weights.eligibility +
        categoryScore * weights.category +
        semanticScore * weights.semantic +
        documentSimilarityScore * weights.document
      );

      // Apply soft penalty
      const totalScore = Math.round(rawTotal * softMultiplier);

      // Combine reasons
      const matchReasons = [...eligibilityReasons, ...warnings];

      if (semanticScore >= 40) {
        matchReasons.push("높은 사업 유사도");
      }
      if (categoryScore >= 60) {
        matchReasons.push("업종 일치");
      }

      const confidence = calculateConfidence(totalScore);

      results.push({
        projectId: project.id,
        disqualified: false,
        disqualifyReasons: [],
        project: {
          id: project.id,
          name: project.name,
          organization: project.organization,
          category: project.category,
          summary: project.summary,
          deadline: project.deadline,
          amountMin: project.amountMin,
          amountMax: project.amountMax,
        },
        totalScore,
        businessSimilarityScore,
        categoryScore,
        eligibilityScore,
        confidence,
        matchReasons,
      });
    }

    // Sort: qualified results first (by score), then disqualified at the end
    results.sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return b.totalScore - a.totalScore;
    });

    // Memory Optimization
    semanticScoreMap!.clear();
    documentSimilarityScoreMap!.clear();
    semanticScoreMap = null;
    documentSimilarityScoreMap = null;

    // Memory Optimization: 상위 100개만 반환하여 메모리 사용량 제한
    const topResults = results.slice(0, 100);
    results.length = 0; // 원본 배열 해제

    return topResults;
  } catch (error) {
    logger.error("Execute matching error", { error });
    throw new Error("Failed to execute matching");
  }
}

/**
 * Store matching results in database (v3 incremental upsert)
 *
 * - Disqualified projects: skip storage (not shown to user by default)
 * - New qualified projects: INSERT with isNew=true, firstMatchedAt=now
 * - Existing projects: UPDATE scores + lastRefreshedAt (preserve viewedAt, feedback)
 */
export async function storeMatchingResults(
  userId: string,
  companyId: string,
  results: MatchingResultData[]
): Promise<{ inserted: number; updated: number; disqualified: number }> {
  try {
    // Filter out disqualified results — don't store them
    const qualifiedResults = results.filter((r) => !r.disqualified).slice(0, 50);
    const disqualifiedCount = results.filter((r) => r.disqualified).length;

    // Get existing result projectIds for this company
    const existingResults = await prisma.matchingResult.findMany({
      where: { companyId },
      select: { projectId: true },
    });
    const existingProjectIds = new Set(existingResults.map((r) => r.projectId));

    let inserted = 0;
    let updated = 0;
    const now = new Date();

    for (const result of qualifiedResults) {
      if (existingProjectIds.has(result.projectId)) {
        // UPDATE: refresh scores + lastRefreshedAt
        await prisma.matchingResult.update({
          where: {
            companyId_projectId: {
              companyId,
              projectId: result.projectId,
            },
          },
          data: {
            totalScore: result.totalScore,
            businessSimilarityScore: result.businessSimilarityScore,
            categoryScore: result.categoryScore,
            eligibilityScore: result.eligibilityScore,
            confidence: result.confidence,
            matchReasons: result.matchReasons,
            disqualified: false,
            disqualifyReasons: [],
            lastRefreshedAt: now,
            // viewedAt, isNew, isRelevant, feedbackNote are NOT touched
          },
        });
        updated++;
      } else {
        // INSERT: new matching result
        await prisma.matchingResult.create({
          data: {
            userId,
            companyId,
            projectId: result.projectId,
            totalScore: result.totalScore,
            businessSimilarityScore: result.businessSimilarityScore,
            categoryScore: result.categoryScore,
            eligibilityScore: result.eligibilityScore,
            timelinessScore: 0,
            amountScore: 0,
            confidence: result.confidence,
            matchReasons: result.matchReasons,
            disqualified: false,
            disqualifyReasons: [],
            isNew: true,
            firstMatchedAt: now,
            lastRefreshedAt: now,
          },
        });
        inserted++;
      }
    }

    logger.info("Matching results stored (v3)", {
      inserted,
      updated,
      disqualified: disqualifiedCount,
      companyId,
    });

    return { inserted, updated, disqualified: disqualifiedCount };
  } catch (error) {
    logger.error("Store results error", { error, companyId });
    throw new Error("Failed to store matching results");
  }
}
