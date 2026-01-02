import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default async function MatchingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 병렬 데이터 페칭 - 두 쿼리를 동시에 실행
  const [companies, recentResults] = await Promise.all([
    // Get user's companies with matching preferences status
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
        businessCategory: true,
        _count: {
          select: {
            matchingResults: true,
            matchingPreferences: true,
          },
        },
      },
    }),
    // Get recent matching results
    prisma.matchingResult.findMany({
      where: {
        userId: session.user.id,
      },
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
          },
        },
      },
    }),
  ]);

  // Check if any company is missing matching preferences
  const companiesWithoutPreferences = companies.filter(
    (c) => c._count.matchingPreferences === 0
  );

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">매칭 대시보드</h1>
        <p className="text-muted-foreground">
          기업별 맞춤 지원사업 매칭 결과를 확인하세요
        </p>
      </div>

      {/* Notice: Missing Matching Preferences */}
      {companiesWithoutPreferences.length > 0 && (
        <Alert className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <span className="font-medium">매칭 선호도 설정이 필요합니다.</span>{" "}
            {companiesWithoutPreferences.length === 1 ? (
              <>
                <Link
                  href={`/companies/${companiesWithoutPreferences[0].id}`}
                  className="underline hover:no-underline"
                >
                  {companiesWithoutPreferences[0].name}
                </Link>
                의 매칭 선호도를 설정해야 자동 매칭이 실행됩니다.
              </>
            ) : (
              <>
                {companiesWithoutPreferences.map((c) => c.name).join(", ")}의
                매칭 선호도를 설정해야 자동 매칭이 실행됩니다.
              </>
            )}
            <Link
              href={`/companies/${companiesWithoutPreferences[0].id}`}
              className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium hover:underline"
            >
              <Settings2 className="h-3 w-3" />
              설정하러 가기
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Companies */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">등록된 기업</h2>
        {companies.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              등록된 기업이 없습니다
            </p>
            <Link
              href="/company/new"
              className="text-primary hover:underline"
            >
              기업 등록하기
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => {
              const hasPreferences = company._count.matchingPreferences > 0;
              const hasResults = company._count.matchingResults > 0;
              // 매칭 결과가 있으면 기업 매칭 상세 페이지로, 없으면 새 매칭 실행 페이지로
              const href = hasResults
                ? `/matching/company/${company.id}`
                : `/matching/new?companyId=${company.id}`;
              return (
                <Link key={company.id} href={href}>
                  <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{company.name}</h3>
                      {hasPreferences ? (
                        <Badge variant="default" className="text-xs">
                          자동매칭
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          설정필요
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {company.businessCategory}
                    </p>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        매칭 결과 {company._count.matchingResults}개
                      </Badge>
                      <span className="text-sm text-primary">
                        {hasResults ? "결과 보기 →" : "매칭 실행 →"}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">최근 매칭 결과</h2>
            <Link
              href="/matching/results"
              className="text-sm text-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>
          <div className="space-y-3">
            {recentResults.map((result) => (
              <Link
                key={result.id}
                href={`/matching/results/${result.id}`}
              >
                <Card className="p-4 hover:border-primary transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            result.confidence === "high"
                              ? "default"
                              : "outline"
                          }
                        >
                          {result.confidence === "high"
                            ? "높은 적합도"
                            : result.confidence === "medium"
                            ? "중간 적합도"
                            : "낮은 적합도"}
                        </Badge>
                        <span className="text-sm font-medium">
                          {result.totalScore}점
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm mb-1">
                        {result.project.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {result.company.name} • {result.project.organization}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {formatDateKST(result.createdAt)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
