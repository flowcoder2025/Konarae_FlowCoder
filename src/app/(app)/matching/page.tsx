import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function MatchingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get user's companies
  const companies = await prisma.company.findMany({
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
        },
      },
    },
  });

  // Get recent matching results
  const recentResults = await prisma.matchingResult.findMany({
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
  });

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">매칭 대시보드</h1>
        <p className="text-muted-foreground">
          기업별 맞춤 지원사업 매칭 결과를 확인하세요
        </p>
      </div>

      {/* Companies */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">등록된 기업</h2>
        {companies.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              등록된 기업이 없습니다
            </p>
            <Link
              href="/companies/new"
              className="text-primary hover:underline"
            >
              기업 등록하기
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => (
              <Link
                key={company.id}
                href={`/matching/new?companyId=${company.id}`}
              >
                <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
                  <h3 className="font-semibold mb-2">{company.name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {company.businessCategory}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      매칭 결과 {company._count.matchingResults}개
                    </Badge>
                    <span className="text-sm text-primary">매칭 실행 →</span>
                  </div>
                </Card>
              </Link>
            ))}
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
