/**
 * Matching Algorithm (PRD 6.2)
 * Multi-dimensional matching: semantic + category + eligibility + timeliness + amount
 */

import { hybridSearch } from "./rag";
import { prisma } from "./prisma";

// Matching weights (PRD 6.2)
const MATCHING_WEIGHTS = {
  semantic: 0.35, // Vector similarity
  category: 0.2, // Category match
  eligibility: 0.2, // Eligibility criteria
  timeliness: 0.15, // Deadline proximity
  amount: 0.1, // Amount range fit
} as const;

export interface MatchingInput {
  companyId: string;
  userId: string;
  preferences?: {
    categories?: string[];
    minAmount?: bigint;
    maxAmount?: bigint;
    regions?: string[];
    excludeKeywords?: string[];
  };
}

export interface MatchingScore {
  totalScore: number;
  semanticScore: number;
  categoryScore: number;
  eligibilityScore: number;
  timelinessScore: number;
  amountScore: number;
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
 * Calculate semantic score using RAG hybrid search
 */
async function calculateSemanticScore(
  companyProfile: string,
  projectId: string
): Promise<number> {
  try {
    const results = await hybridSearch({
      queryText: companyProfile,
      sourceType: "support_project",
      matchThreshold: 0.5,
      matchCount: 50,
      semanticWeight: 0.8,
    });

    // Find match for this project
    const projectMatch = results.find((r) => r.sourceId === projectId);

    if (projectMatch) {
      // Normalize combined score to 0-100
      return Math.round(projectMatch.combinedScore * 100);
    }

    return 0;
  } catch (error) {
    console.error("[Matching] Semantic score error:", error);
    return 0;
  }
}

/**
 * Calculate category match score
 */
export function calculateCategoryScore(
  companyCategories: string[],
  projectCategory: string,
  projectSubCategory?: string | null
): number {
  let score = 0;

  // Direct category match
  if (companyCategories.includes(projectCategory)) {
    score += 60;
  }

  // Subcategory match
  if (projectSubCategory && companyCategories.includes(projectSubCategory)) {
    score += 40;
  }

  // Partial match (industry-related keywords)
  const partialMatch = companyCategories.some((cat) =>
    projectCategory.includes(cat) || cat.includes(projectCategory)
  );
  if (partialMatch && score === 0) {
    score = 30;
  }

  return Math.min(score, 100);
}

/**
 * Calculate eligibility score
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

  // Company type match
  if (target.includes("중소기업") || target.includes("sme")) {
    if (company.companyType.includes("중소")) {
      score += 20;
      reasons.push("중소기업 대상 사업");
    }
  }

  // Venture certification
  if (
    (target.includes("벤처") || eligibility.includes("벤처")) &&
    company.isVenture
  ) {
    score += 15;
    reasons.push("벤처기업 인증 보유");
  }

  // InnoBiz certification
  if (
    (target.includes("이노비즈") || eligibility.includes("이노비즈")) &&
    company.isInnoBiz
  ) {
    score += 10;
    reasons.push("이노비즈 인증 보유");
  }

  // MainBiz certification
  if (
    (target.includes("메인비즈") || eligibility.includes("메인비즈")) &&
    company.isMainBiz
  ) {
    score += 10;
    reasons.push("메인비즈 인증 보유");
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
 * Calculate timeliness score (deadline proximity)
 */
export function calculateTimelinessScore(
  deadline?: Date | null,
  isPermanent?: boolean
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (isPermanent) {
    reasons.push("상시모집");
    return { score: 100, reasons };
  }

  if (!deadline) {
    return { score: 50, reasons: ["마감일 미정"] };
  }

  const now = new Date();
  const daysUntilDeadline = Math.floor(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilDeadline < 0) {
    reasons.push("마감 지남");
    return { score: 0, reasons };
  }

  if (daysUntilDeadline <= 7) {
    reasons.push("마감 임박 (7일 이내)");
    return { score: 100, reasons };
  }

  if (daysUntilDeadline <= 30) {
    reasons.push("마감 1개월 이내");
    return { score: 80, reasons };
  }

  if (daysUntilDeadline <= 60) {
    reasons.push("마감 2개월 이내");
    return { score: 60, reasons };
  }

  reasons.push(`마감까지 ${daysUntilDeadline}일`);
  return { score: 40, reasons };
}

/**
 * Calculate amount fit score
 */
export function calculateAmountScore(
  companyRevenue?: bigint | null,
  projectAmountMin?: bigint | null,
  projectAmountMax?: bigint | null
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // No amount info
  if (!projectAmountMin && !projectAmountMax) {
    return { score: 50, reasons: ["지원금액 미정"] };
  }

  // No company revenue
  if (!companyRevenue) {
    return { score: 50, reasons: ["기업 매출액 정보 없음"] };
  }

  const revenue = Number(companyRevenue);
  const min = projectAmountMin ? Number(projectAmountMin) : 0;
  const max = projectAmountMax ? Number(projectAmountMax) : Infinity;

  // Check if company can benefit from this amount
  const revenueRatio = revenue > 0 ? max / revenue : 0;

  if (revenueRatio >= 0.1 && revenueRatio <= 0.5) {
    // Sweet spot: 10-50% of revenue
    reasons.push("적정 지원 규모");
    return { score: 100, reasons };
  }

  if (revenueRatio >= 0.05 && revenueRatio <= 1.0) {
    reasons.push("적합한 지원 규모");
    return { score: 70, reasons };
  }

  if (revenueRatio < 0.05) {
    reasons.push("소액 지원");
    return { score: 40, reasons };
  }

  reasons.push("대규모 지원");
  return { score: 60, reasons };
}

/**
 * Calculate overall confidence level
 */
function calculateConfidence(
  totalScore: number
): "high" | "medium" | "low" {
  if (totalScore >= 80) return "high";
  if (totalScore >= 60) return "medium";
  return "low";
}

/**
 * Execute matching for a company
 */
export async function executeMatching(
  input: MatchingInput
): Promise<MatchingResultData[]> {
  try {
    // Get company data
    const company = await prisma.company.findUnique({
      where: { id: input.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
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
      },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Build company profile for semantic search
    const companyProfile = [
      company.name,
      company.businessCategory,
      company.mainBusiness,
      ...(company.businessItems || []),
      company.introduction,
      company.vision,
      company.mission,
    ]
      .filter(Boolean)
      .join(" ");

    // Get active projects
    const whereClause: any = {
      deletedAt: null,
      status: "active",
    };

    // Apply preferences
    if (input.preferences) {
      if (input.preferences.categories?.length) {
        whereClause.category = { in: input.preferences.categories };
      }

      if (input.preferences.regions?.length) {
        whereClause.region = { in: input.preferences.regions };
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
        target: true,
        eligibility: true,
        amountMin: true,
        amountMax: true,
        deadline: true,
        isPermanent: true,
        summary: true,
      },
      take: 100, // Limit for performance
    });

    // Calculate scores for each project
    const results: MatchingResultData[] = [];

    for (const project of projects) {
      // Semantic score
      const semanticScore = await calculateSemanticScore(
        companyProfile,
        project.id
      );

      // Category score
      const categoryScore = calculateCategoryScore(
        [
          company.businessCategory,
          company.mainBusiness,
          ...(company.businessItems || []),
        ].filter(Boolean) as string[],
        project.category,
        project.subCategory
      );

      // Eligibility score
      const { score: eligibilityScore, reasons: eligibilityReasons } =
        calculateEligibilityScore(company, project);

      // Timeliness score
      const { score: timelinessScore, reasons: timelinessReasons } =
        calculateTimelinessScore(project.deadline, project.isPermanent);

      // Amount score
      const { score: amountScore, reasons: amountReasons } =
        calculateAmountScore(
          company.annualRevenue,
          project.amountMin,
          project.amountMax
        );

      // Calculate total score
      const totalScore = Math.round(
        semanticScore * MATCHING_WEIGHTS.semantic +
          categoryScore * MATCHING_WEIGHTS.category +
          eligibilityScore * MATCHING_WEIGHTS.eligibility +
          timelinessScore * MATCHING_WEIGHTS.timeliness +
          amountScore * MATCHING_WEIGHTS.amount
      );

      // Combine reasons
      const matchReasons = [
        ...eligibilityReasons,
        ...timelinessReasons,
        ...amountReasons,
      ];

      // Add semantic reason if high
      if (semanticScore >= 70) {
        matchReasons.push("높은 의미적 유사도");
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
        semanticScore,
        categoryScore,
        eligibilityScore,
        timelinessScore,
        amountScore,
        confidence,
        matchReasons,
      });
    }

    // Sort by total score (descending)
    results.sort((a, b) => b.totalScore - a.totalScore);

    return results;
  } catch (error) {
    console.error("[Matching] Execute matching error:", error);
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
    // Delete old results for this company
    await prisma.matchingResult.deleteMany({
      where: { userId, companyId },
    });

    // Store new results (top 50)
    const topResults = results.slice(0, 50);

    await prisma.matchingResult.createMany({
      data: topResults.map((result) => ({
        userId,
        companyId,
        projectId: result.projectId,
        totalScore: result.totalScore,
        semanticScore: result.semanticScore,
        categoryScore: result.categoryScore,
        eligibilityScore: result.eligibilityScore,
        timelinessScore: result.timelinessScore,
        amountScore: result.amountScore,
        confidence: result.confidence,
        matchReasons: result.matchReasons,
      })),
    });

    console.log(
      `[Matching] Stored ${topResults.length} results for company ${companyId}`
    );
  } catch (error) {
    console.error("[Matching] Store results error:", error);
    throw new Error("Failed to store matching results");
  }
}
