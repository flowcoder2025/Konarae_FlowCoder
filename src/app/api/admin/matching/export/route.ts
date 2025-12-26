/**
 * Admin Matching Export API
 * 매칭 결과 CSV 내보내기
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ module: "admin-matching-export" });

// 신뢰도 라벨
const confidenceLabels: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    await requireAdmin();

    // URL 쿼리 파라미터 파싱
    const searchParams = request.nextUrl.searchParams;
    const confidence = searchParams.get("confidence");
    const minScore = searchParams.get("minScore");
    const maxScore = searchParams.get("maxScore");
    const search = searchParams.get("search");

    // 필터 조건 구성
    const whereClause: Prisma.MatchingResultWhereInput = {};

    // 신뢰도 필터
    if (confidence && ["high", "medium", "low"].includes(confidence)) {
      whereClause.confidence = confidence;
    }

    // 점수 범위 필터
    if (minScore) {
      const min = parseInt(minScore, 10);
      if (!isNaN(min)) {
        whereClause.totalScore = {
          ...((whereClause.totalScore as Prisma.IntFilter) || {}),
          gte: min,
        };
      }
    }

    if (maxScore) {
      const max = parseInt(maxScore, 10);
      if (!isNaN(max)) {
        whereClause.totalScore = {
          ...((whereClause.totalScore as Prisma.IntFilter) || {}),
          lte: max,
        };
      }
    }

    // 검색 필터 (기업명 또는 프로젝트명)
    if (search) {
      whereClause.OR = [
        {
          company: {
            name: { contains: search, mode: "insensitive" },
          },
        },
        {
          project: {
            name: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    // 매칭 결과 조회 (최대 5000건)
    const results = await prisma.matchingResult.findMany({
      where: whereClause,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        company: {
          select: {
            name: true,
            businessCategory: true,
          },
        },
        project: {
          select: {
            name: true,
            organization: true,
            category: true,
          },
        },
      },
    });

    // CSV 헤더
    const headers = [
      "ID",
      "기업명",
      "업종",
      "지원사업명",
      "지원기관",
      "카테고리",
      "총점",
      "유사도점수",
      "업종점수",
      "자격점수",
      "신뢰도",
      "매칭사유",
      "사용자",
      "생성일",
    ];

    // CSV 행 생성
    const rows = results.map((result) => [
      result.id,
      escapeCsvField(result.company.name),
      escapeCsvField(result.company.businessCategory || ""),
      escapeCsvField(result.project.name),
      escapeCsvField(result.project.organization),
      escapeCsvField(result.project.category),
      result.totalScore.toString(),
      result.businessSimilarityScore.toString(),
      result.categoryScore.toString(),
      result.eligibilityScore.toString(),
      confidenceLabels[result.confidence] || result.confidence,
      escapeCsvField(result.matchReasons.join(", ")),
      escapeCsvField(result.user.name || result.user.email),
      formatDateKST(result.createdAt),
    ]);

    // CSV 문자열 생성 (BOM 포함 - Excel 한글 호환)
    const BOM = "\uFEFF";
    const csvContent =
      BOM +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    // 파일명 생성
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `matching_results_${timestamp}.csv`;

    logger.info("Matching results exported", { count: results.length });

    // CSV 응답 반환
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("Matching export error", { error });

    if (error instanceof Error && error.message === "Admin access required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to export matching results" },
      { status: 500 }
    );
  }
}

/**
 * CSV 필드 이스케이프 (쌍따옴표, 쉼표, 줄바꿈 처리)
 */
function escapeCsvField(field: string): string {
  if (!field) return "";

  // 쌍따옴표, 쉼표, 줄바꿈이 있으면 이스케이프 필요
  if (field.includes('"') || field.includes(",") || field.includes("\n")) {
    // 쌍따옴표를 두 개로 이스케이프하고 전체를 쌍따옴표로 감싸기
    return `"${field.replace(/"/g, '""')}"`;
  }

  return field;
}
