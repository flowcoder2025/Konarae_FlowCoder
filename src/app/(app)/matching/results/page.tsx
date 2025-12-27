import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MatchResultCard } from "@/components/matching/match-result-card";
import { MatchFilters } from "@/components/matching/match-filters";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MatchingResultsPageProps {
  searchParams: Promise<{
    page?: string;
    companyId?: string;
    confidence?: string;
    sort?: string;
  }>;
}

export default async function MatchingResultsPage({
  searchParams,
}: MatchingResultsPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: any = {
    userId: session.user.id,
  };

  if (params.companyId) {
    where.companyId = params.companyId;
  }

  if (params.confidence) {
    where.confidence = params.confidence;
  }

  // Build orderBy clause based on sort parameter
  const sort = params.sort || "score";
  let orderBy: any = { totalScore: "desc" }; // default

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

  const [rawResults, total, userCompanies] = await Promise.all([
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
    // Get user's companies for filter
    prisma.company.findMany({
      where: {
        members: {
          some: { userId: session.user.id },
        },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Type-safe result mapping with required fields for MatchResultCard
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

  // Calculate confidence stats
  const highConfidence = results.filter(
    (r) => r.confidence === "high"
  ).length;
  const mediumConfidence = results.filter(
    (r) => r.confidence === "medium"
  ).length;
  const lowConfidence = results.filter((r) => r.confidence === "low").length;

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">매칭 결과</h1>
        <p className="text-muted-foreground">
          총 {total}개의 매칭 결과 (높음: {highConfidence}, 중간:{" "}
          {mediumConfidence}, 낮음: {lowConfidence})
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <MatchFilters companies={userCompanies} />
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">매칭 결과가 없습니다</p>
          <a href="/matching" className="text-primary hover:underline">
            매칭 실행하기
          </a>
        </div>
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
          {/* Previous Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? (
              <Link
                href={`/matching/results?${new URLSearchParams({
                  ...(params.companyId && { companyId: params.companyId }),
                  ...(params.confidence && { confidence: params.confidence }),
                  ...(params.sort && { sort: params.sort }),
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

          {/* Page Numbers */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Show pages around current page
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
                      href={`/matching/results?${new URLSearchParams({
                        ...(params.companyId && { companyId: params.companyId }),
                        ...(params.confidence && { confidence: params.confidence }),
                        ...(params.sort && { sort: params.sort }),
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

          {/* Next Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? (
              <Link
                href={`/matching/results?${new URLSearchParams({
                  ...(params.companyId && { companyId: params.companyId }),
                  ...(params.confidence && { confidence: params.confidence }),
                  ...(params.sort && { sort: params.sort }),
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

          {/* Page Info */}
          <span className="ml-4 text-sm text-muted-foreground">
            {page} / {totalPages} 페이지
          </span>
        </div>
      )}
    </div>
  );
}
