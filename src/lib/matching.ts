/**
 * Matching Algorithm (PRD 6.2) - v2
 *
 * 매칭 점수 계산 (3가지 요소):
 * - businessSimilarity (50%): 사업 유사도 (텍스트 + 문서 벡터)
 * - category (25%): 업종 적합도 (기업 업종 vs 프로젝트 대상/자격요건)
 * - eligibility (25%): 자격 요건 (인증, 기업 유형 등)
 *
 * 필터링:
 * - preferences.categories: 사용자 관심 분야로 프로젝트 필터링 (R&D, 수출 등)
 *
 * v2 변경사항:
 * - timeliness, amount 점수 제거 (매칭 품질에 불필요)
 * - categoryScore: 기업 업종과 프로젝트 target/eligibility 키워드 매칭으로 변경
 */

import { hybridSearch } from "./rag";
import { prisma } from "./prisma";
import { createLogger } from "./logger";
import { Prisma } from "@prisma/client";
import {
  extractRegionFromAddress,
  extractSubRegionFromAddress,
  isRegionMatch,
  type RegionCode,
} from "./region";

const logger = createLogger({ module: "matching" });

// Matching weights - Simplified (v2)
// Removed: timeliness, amount (not meaningful for matching quality)
const MATCHING_WEIGHTS = {
  businessSimilarity: 0.50, // 사업 유사도 (텍스트 + 문서 벡터 통합)
  category: 0.25, // 관심 분야 일치도 (사용자 선호도 vs 프로젝트 카테고리)
  eligibility: 0.25, // 자격 요건 (인증, 기업 유형 등)
} as const;

/**
 * Scale business similarity score to realistic range
 * Raw cosine similarity typically produces 25-50 range scores
 * This scales them to 50-100 range for better distribution
 *
 * @param rawScore - Raw similarity score (0-100)
 * @returns Scaled score (0-100)
 */
function scaleBusinessSimilarity(rawScore: number): number {
  if (rawScore <= 0) return 0;

  // Input range: 20-50 (realistic observed range)
  // Output range: 50-100
  const inputMin = 20;
  const inputMax = 50;
  const outputMin = 50;
  const outputMax = 100;

  // Clamp input to expected range
  const clampedScore = Math.max(inputMin, Math.min(inputMax, rawScore));

  // Linear scaling
  const scaled =
    ((clampedScore - inputMin) / (inputMax - inputMin)) *
      (outputMax - outputMin) +
    outputMin;

  return Math.round(Math.min(100, scaled));
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
        LIMIT 50
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
        address: true, // 지역 필터링용 주소 추가
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

    const projects = await prisma.supportProject.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        subCategory: true,
        region: true, // v3: 지역 필터링용
        subRegion: true, // v4: 시·군·구 필터링용
        target: true,
        eligibility: true,
        amountMin: true,
        amountMax: true,
        deadline: true,
        isPermanent: true,
        summary: true,
      },
      take: 200, // v3: 지역 필터링 후 결과 보장을 위해 증가
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

    // Calculate scores for each project
    const results: MatchingResultData[] = [];

    // Batch score calculations (optimized - parallel)
    const projectIds = filteredProjects.map((p) => p.id);

    // 병렬로 두 가지 유사도 점수 계산
    const [semanticScoreMap, documentSimilarityScoreMap] = await Promise.all([
      calculateSemanticScoresBatch(companyProfile, projectIds),
      calculateDocumentSimilarityScoresBatch(company.id, projectIds),
    ]);

    for (const project of filteredProjects) {
      // 텍스트 기반 유사도
      const semanticScore = semanticScoreMap.get(project.id) || 0;

      // 문서 벡터 유사도
      const documentSimilarityScore =
        documentSimilarityScoreMap.get(project.id) || 0;

      // 사업 유사도 = 텍스트(60%) + 문서벡터(40%) 가중 평균
      // 문서 벡터가 없으면 텍스트만 사용
      const rawBusinessSimilarity =
        documentSimilarityScore > 0
          ? Math.round(semanticScore * 0.6 + documentSimilarityScore * 0.4)
          : semanticScore;

      // 스케일링 적용: 20-50 범위를 50-100 범위로 변환
      const businessSimilarityScore = scaleBusinessSimilarity(rawBusinessSimilarity);

      // Category score (업종 적합도) - v2: 기업 업종과 프로젝트 대상/이름 비교
      const categoryScore = calculateCategoryScore(
        [
          company.businessCategory,
          company.mainBusiness,
          ...(company.businessItems || []),
        ].filter(Boolean) as string[],
        project.target,
        project.eligibility,
        project.name // 프로젝트 이름도 업종 매칭에 활용
      );

      // Eligibility score (자격 요건)
      const { score: eligibilityScore, reasons: eligibilityReasons } =
        calculateEligibilityScore(company, project);

      // Calculate total score (v2: 3가지 요소만 사용)
      const totalScore = Math.round(
        businessSimilarityScore * MATCHING_WEIGHTS.businessSimilarity +
          categoryScore * MATCHING_WEIGHTS.category +
          eligibilityScore * MATCHING_WEIGHTS.eligibility
      );

      // Combine reasons
      const matchReasons = [...eligibilityReasons];

      // Add business similarity reason if high
      if (businessSimilarityScore >= 70) {
        matchReasons.push("높은 사업 유사도");
      }

      // Add category reason if high
      if (categoryScore >= 60) {
        matchReasons.push("업종 일치");
      }

      const confidence = calculateConfidence(totalScore);

      results.push({
        projectId: project.id,
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

    // Sort by total score (descending)
    results.sort((a, b) => b.totalScore - a.totalScore);

    return results;
  } catch (error) {
    logger.error("Execute matching error", { error });
    throw new Error("Failed to execute matching");
  }
}

/**
 * Store matching results in database
 */
export async function storeMatchingResults(
  userId: string,
  companyId: string,
  results: MatchingResultData[]
): Promise<void> {
  try {
    // Delete old results for this company (모든 사용자의 결과 삭제 - @@unique([companyId, projectId]) 충돌 방지)
    await prisma.matchingResult.deleteMany({
      where: { companyId },
    });

    // Store new results (top 50)
    const topResults = results.slice(0, 50);

    await prisma.matchingResult.createMany({
      data: topResults.map((result) => ({
        userId,
        companyId,
        projectId: result.projectId,
        totalScore: result.totalScore,
        businessSimilarityScore: result.businessSimilarityScore,
        categoryScore: result.categoryScore,
        eligibilityScore: result.eligibilityScore,
        timelinessScore: 0, // Deprecated: 더 이상 사용하지 않음
        amountScore: 0, // Deprecated: 더 이상 사용하지 않음
        confidence: result.confidence,
        matchReasons: result.matchReasons,
      })),
    });

    logger.info("Matching results stored", {
      resultCount: topResults.length,
      companyId,
    });
  } catch (error) {
    logger.error("Store results error", { error, companyId });
    throw new Error("Failed to store matching results");
  }
}
