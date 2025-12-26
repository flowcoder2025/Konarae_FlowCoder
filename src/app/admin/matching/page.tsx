/**
 * Admin Matching Management Page
 * 전체 매칭 현황 모니터링 및 관리
 */

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchingFilters } from "@/components/admin/matching-filters";
import {
  Target,
  TrendingUp,
  Building2,
  BarChart3,
  CheckCircle,
  AlertCircle,
  MinusCircle,
} from "lucide-react";
import { Prisma } from "@prisma/client";

// 신뢰도별 배지 스타일
const confidenceBadgeVariant = {
  high: "default" as const,
  medium: "secondary" as const,
  low: "outline" as const,
};

const confidenceLabel = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const confidenceIcon = {
  high: CheckCircle,
  medium: AlertCircle,
  low: MinusCircle,
};

interface PageProps {
  searchParams: Promise<{
    confidence?: string;
    minScore?: string;
    maxScore?: string;
    search?: string;
  }>;
}

export default async function AdminMatchingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { confidence, minScore, maxScore, search } = params;

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

  // 매칭 결과 통계 (전체 기준)
  const [totalResults, highConfidenceCount, avgScore, companyCount] =
    await Promise.all([
      prisma.matchingResult.count(),
      prisma.matchingResult.count({ where: { confidence: "high" } }),
      prisma.matchingResult.aggregate({
        _avg: { totalScore: true },
      }),
      prisma.matchingResult
        .groupBy({
          by: ["companyId"],
        })
        .then((groups) => groups.length),
    ]);

  // 필터링된 결과 수
  const filteredCount = await prisma.matchingResult.count({ where: whereClause });

  // 필터링된 매칭 결과 목록 (상위 100개)
  const recentResults = await prisma.matchingResult.findMany({
    where: whereClause,
    take: 100,
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

  // 기업별 매칭 요약 (상위 20개 기업)
  const companyMatchingSummary = await prisma.matchingResult.groupBy({
    by: ["companyId"],
    _count: { id: true },
    _avg: { totalScore: true },
    _max: { totalScore: true },
    orderBy: {
      _count: { id: "desc" },
    },
    take: 20,
  });

  // 기업 정보 매핑
  const companyIds = companyMatchingSummary.map((s) => s.companyId);
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true },
  });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const stats = [
    {
      label: "총 매칭 결과",
      value: totalResults.toLocaleString(),
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "고신뢰도 매칭",
      value: `${highConfidenceCount.toLocaleString()} (${
        totalResults > 0
          ? Math.round((highConfidenceCount / totalResults) * 100)
          : 0
      }%)`,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "평균 매칭 점수",
      value: Math.round(avgScore._avg.totalScore || 0).toString(),
      icon: BarChart3,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "매칭 기업 수",
      value: companyCount.toLocaleString(),
      icon: Building2,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ];

  const hasFilters = confidence || minScore || maxScore || search;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">매칭 현황</h1>
        <p className="mt-2 text-muted-foreground">
          전체 매칭 결과를 모니터링하고 관리할 수 있습니다
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2 ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Company Matching Summary */}
      <Card>
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">기업별 매칭 요약</h2>
          <p className="text-sm text-muted-foreground">
            매칭 결과가 많은 상위 20개 기업
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">기업명</th>
                <th className="p-4 text-right font-medium">매칭 수</th>
                <th className="p-4 text-right font-medium">평균 점수</th>
                <th className="p-4 text-right font-medium">최고 점수</th>
              </tr>
            </thead>
            <tbody>
              {companyMatchingSummary.map((summary) => (
                <tr
                  key={summary.companyId}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="p-4 font-medium">
                    {companyMap.get(summary.companyId) || "알 수 없음"}
                  </td>
                  <td className="p-4 text-right">
                    {summary._count.id.toLocaleString()}건
                  </td>
                  <td className="p-4 text-right">
                    {Math.round(summary._avg.totalScore || 0)}점
                  </td>
                  <td className="p-4 text-right">
                    <Badge variant="default">{summary._max.totalScore}점</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {companyMatchingSummary.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              매칭 데이터가 없습니다
            </div>
          )}
        </div>
      </Card>

      {/* Filters and Recent Matching Results */}
      <Card>
        <div className="border-b p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">매칭 결과 검색</h2>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? `필터링된 결과: ${filteredCount.toLocaleString()}건 (전체 ${totalResults.toLocaleString()}건)`
                : `최근 생성된 매칭 결과 (최대 100건)`}
            </p>
          </div>

          {/* Filters */}
          <Suspense fallback={<div className="h-10" />}>
            <MatchingFilters />
          </Suspense>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">기업</th>
                <th className="p-4 text-left font-medium">지원사업</th>
                <th className="p-4 text-right font-medium">총점</th>
                <th className="p-4 text-right font-medium">유사도</th>
                <th className="p-4 text-right font-medium">업종</th>
                <th className="p-4 text-right font-medium">자격</th>
                <th className="p-4 text-center font-medium">신뢰도</th>
                <th className="p-4 text-left font-medium">매칭 사유</th>
                <th className="p-4 text-left font-medium">생성일</th>
              </tr>
            </thead>
            <tbody>
              {recentResults.map((result) => {
                const ConfidenceIcon =
                  confidenceIcon[
                    result.confidence as keyof typeof confidenceIcon
                  ] || MinusCircle;

                return (
                  <tr
                    key={result.id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="p-4">
                      <div>
                        <div className="font-medium">
                          {result.company.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.company.businessCategory || "-"}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium line-clamp-1 max-w-[200px]">
                          {result.project.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.project.organization}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Badge
                        variant={
                          result.totalScore >= 60
                            ? "default"
                            : result.totalScore >= 45
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {result.totalScore}점
                      </Badge>
                    </td>
                    <td className="p-4 text-right text-sm">
                      {result.businessSimilarityScore}
                    </td>
                    <td className="p-4 text-right text-sm">
                      {result.categoryScore}
                    </td>
                    <td className="p-4 text-right text-sm">
                      {result.eligibilityScore}
                    </td>
                    <td className="p-4 text-center">
                      <Badge
                        variant={
                          confidenceBadgeVariant[
                            result.confidence as keyof typeof confidenceBadgeVariant
                          ] || "outline"
                        }
                        className="gap-1"
                      >
                        <ConfidenceIcon className="h-3 w-3" />
                        {confidenceLabel[
                          result.confidence as keyof typeof confidenceLabel
                        ] || result.confidence}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="max-w-[150px]">
                        {result.matchReasons.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {result.matchReasons.slice(0, 2).map((reason, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
                                {reason}
                              </Badge>
                            ))}
                            {result.matchReasons.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{result.matchReasons.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateKST(result.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {recentResults.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {hasFilters
                ? "검색 조건에 맞는 매칭 결과가 없습니다"
                : "매칭 결과가 없습니다"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
