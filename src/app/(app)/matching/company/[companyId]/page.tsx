import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { MatchResultCard } from "@/components/matching/match-result-card";
import { MatchFilters } from "@/components/matching/match-filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Building2,
  Sparkles,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { formatDateKST } from "@/lib/utils";

interface CompanyMatchingPageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    page?: string;
    confidence?: string;
    sort?: string;
  }>;
}

export default async function CompanyMatchingPage({
  params,
  searchParams,
}: CompanyMatchingPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { companyId } = await params;
  const searchParamsResolved = await searchParams;
  const page = parseInt(searchParamsResolved.page || "1");
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // 기업 정보 조회 + 권한 확인
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      members: {
        some: { userId: session.user.id },
      },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      businessCategory: true,
      _count: {
        select: {
          matchingPreferences: true,
        },
      },
    },
  });

  if (!company) {
    notFound();
  }

  // 매칭 결과 필터 조건
  const where: Record<string, unknown> = {
    userId: session.user.id,
    companyId: companyId,
  };

  if (searchParamsResolved.confidence) {
    where.confidence = searchParamsResolved.confidence;
  }

  // 정렬
  const sort = searchParamsResolved.sort || "score";
  let orderBy: Record<string, unknown> = { totalScore: "desc" };

  switch (sort) {
    case "score_asc":
      orderBy = { totalScore: "asc" };
      break;
    case "date":
      orderBy = { createdAt: "desc" };
      break;
    case "deadline":
      orderBy = { project: { deadline: "asc" } };
      break;
    default:
      orderBy = { totalScore: "desc" };
  }

  // 병렬 데이터 조회
  const [rawResults, total, stats] = await Promise.all([
    prisma.matchingResult.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            sourceUrl: true,
            category: true,
            subCategory: true,
            summary: true,
            amountMin: true,
            amountMax: true,
            deadline: true,
            isPermanent: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.matchingResult.count({ where }),
    // 통계 조회
    prisma.matchingResult.groupBy({
      by: ["confidence"],
      where: {
        userId: session.user.id,
        companyId: companyId,
      },
      _count: true,
    }),
  ]);

  // 타입 안전한 결과 매핑
  const results = rawResults.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    companyId: r.companyId,
    totalScore: r.totalScore,
    businessSimilarityScore: r.businessSimilarityScore,
    categoryScore: r.categoryScore,
    eligibilityScore: r.eligibilityScore,
    confidence: r.confidence as "high" | "medium" | "low",
    matchReasons: r.matchReasons,
    project: r.project,
  }));

  const totalPages = Math.ceil(total / pageSize);

  // 통계 계산
  const highCount =
    stats.find((s) => s.confidence === "high")?._count || 0;
  const mediumCount =
    stats.find((s) => s.confidence === "medium")?._count || 0;
  const lowCount =
    stats.find((s) => s.confidence === "low")?._count || 0;

  const hasPreferences = company._count.matchingPreferences > 0;

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Back Link */}
      <Link
        href="/matching"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        매칭 대시보드로 돌아가기
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{company.name}</h1>
          {hasPreferences ? (
            <Badge variant="default">자동매칭</Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              설정필요
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {company.businessCategory || "업종 미설정"} • 매칭 결과 {total}개
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 매칭</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">높은 적합도</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {highCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
              <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">중간 적합도</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {mediumCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">낮은 적합도</p>
              <p className="text-2xl font-bold">{lowCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <Button asChild>
          <Link href={`/matching/new?companyId=${company.id}`}>
            <Sparkles className="h-4 w-4 mr-2" />
            새 매칭 실행
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/companies/${company.id}`}>기업 정보 수정</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <MatchFilters
          companies={[]}
          hideCompanyFilter
          basePath={`/matching/company/${companyId}`}
        />
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">매칭 결과가 없습니다</p>
          <p className="text-muted-foreground mb-6">
            이 기업에 대한 매칭을 실행해보세요
          </p>
          <Button asChild>
            <Link href={`/matching/new?companyId=${company.id}`}>
              매칭 실행하기
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((result) => (
            <MatchResultCard key={result.id} result={result} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? (
              <Link
                href={`/matching/company/${companyId}?${new URLSearchParams({
                  ...(searchParamsResolved.confidence && {
                    confidence: searchParamsResolved.confidence,
                  }),
                  ...(searchParamsResolved.sort && {
                    sort: searchParamsResolved.sort,
                  }),
                  page: String(page - 1),
                }).toString()}`}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                이전
              </Link>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                이전
              </>
            )}
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  className="w-9"
                  asChild={pageNum !== page}
                >
                  {pageNum === page ? (
                    <span>{pageNum}</span>
                  ) : (
                    <Link
                      href={`/matching/company/${companyId}?${new URLSearchParams({
                        ...(searchParamsResolved.confidence && {
                          confidence: searchParamsResolved.confidence,
                        }),
                        ...(searchParamsResolved.sort && {
                          sort: searchParamsResolved.sort,
                        }),
                        page: String(pageNum),
                      }).toString()}`}
                    >
                      {pageNum}
                    </Link>
                  )}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? (
              <Link
                href={`/matching/company/${companyId}?${new URLSearchParams({
                  ...(searchParamsResolved.confidence && {
                    confidence: searchParamsResolved.confidence,
                  }),
                  ...(searchParamsResolved.sort && {
                    sort: searchParamsResolved.sort,
                  }),
                  page: String(page + 1),
                }).toString()}`}
              >
                다음
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            ) : (
              <>
                다음
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>

          <span className="ml-4 text-sm text-muted-foreground">
            {page} / {totalPages} 페이지
          </span>
        </div>
      )}
    </div>
  );
}
