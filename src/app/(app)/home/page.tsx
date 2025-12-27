import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getOrCreateCredit } from "@/lib/credits";
import { createLogger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ArrowRight,
  Building2,
  Calendar,
  TrendingUp,
  Clock,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";

const logger = createLogger({ page: "home" });

interface HomeData {
  user: {
    name: string | null;
    hasCompany: boolean;
    creditBalance: number;
  };
  recommendations: Array<{
    id: string;
    title: string;
    agency: string;
    deadline: string | null;
    daysLeft: number | null;
    budget: number | null;
    matchScore?: number;
  }>;
  activeProjects: Array<{
    id: string;
    projectName: string;
    companyName: string;
    currentStep: number;
    status: string;
    updatedAt: string;
  }>;
  pendingTasks: Array<{
    type: "diagnosis" | "plan" | "verify";
    projectId: string;
    projectName: string;
    description: string;
  }>;
}

async function getHomeData(userId: string): Promise<HomeData> {
  const [user, userCompanies, matchingResults, upcomingProjects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    prisma.companyMember.findMany({
      where: { userId },
      include: { company: true },
    }),
    prisma.matchingResult.findMany({
      where: {
        company: {
          members: { some: { userId } },
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            deadline: true,
            amountMax: true,
          },
        },
        company: { select: { name: true } },
      },
      orderBy: { totalScore: "desc" },
      take: 5,
    }),
    prisma.supportProject.findMany({
      where: {
        deadline: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        status: "active",
      },
      orderBy: { deadline: "asc" },
      take: 5,
    }),
  ]);

  const creditData = await getOrCreateCredit(userId);
  const hasCompany = userCompanies.length > 0;

  // Get recommendations from matching results or upcoming projects
  const recommendations = matchingResults.length > 0
    ? matchingResults.map((m) => ({
        id: m.project.id,
        title: m.project.name,
        agency: m.project.organization,
        deadline: m.project.deadline?.toISOString() || null,
        daysLeft: m.project.deadline
          ? Math.ceil((new Date(m.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
        budget: m.project.amountMax ? Number(m.project.amountMax) : null,
        matchScore: m.totalScore,
      }))
    : upcomingProjects.map((p) => ({
        id: p.id,
        title: p.name,
        agency: p.organization,
        deadline: p.deadline?.toISOString() || null,
        daysLeft: p.deadline
          ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
        budget: p.amountMax ? Number(p.amountMax) : null,
      }));

  return {
    user: {
      name: user?.name || null,
      hasCompany,
      creditBalance: creditData.balance,
    },
    recommendations,
    activeProjects: [], // TODO: UserProject 모델 생성 후 연동
    pendingTasks: [],
  };
}

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let data: HomeData | null = null;
  let error = false;

  try {
    data = await getHomeData(session.user.id);
  } catch (e) {
    logger.error("Failed to load home data", { error: e });
    error = true;
  }

  const showOnboarding = data && !data.user.hasCompany;

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-7xl">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {data?.user.name ? `${data.user.name}님, 안녕하세요!` : "안녕하세요!"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            오늘도 지원사업 성공을 위해 함께해요
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Sparkles className="h-3 w-3 mr-1" />
          {data?.user.creditBalance.toLocaleString() || 0}C
        </Badge>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      )}

      {/* Onboarding CTA for new users */}
      {showOnboarding && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">
                  시작하기: 기업 정보 입력
                </h2>
                <p className="text-muted-foreground">
                  기업 정보를 입력하면 딱 맞는 지원사업을 추천해드려요
                </p>
              </div>
              <Button asChild size="lg">
                <Link href="/company">
                  <Building2 className="h-4 w-4 mr-2" />
                  기업 등록하기
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data && !showOnboarding && (
        <>
          {/* Active Projects Section */}
          {data.activeProjects.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  진행 중인 프로젝트
                </h2>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/my-projects">
                    전체보기
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.activeProjects.map((project) => (
                  <Link key={project.id} href={`/my-projects/${project.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="py-4">
                        <div className="space-y-2">
                          <p className="font-medium line-clamp-1">{project.projectName}</p>
                          <p className="text-sm text-muted-foreground">{project.companyName}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${(project.currentStep / 5) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {project.currentStep}/5
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recommendations Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                맞춤 추천 지원사업
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/projects">
                  전체 지원사업 보기
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>

            {data.recommendations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    아직 추천할 지원사업이 없습니다
                  </p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href="/projects">지원사업 둘러보기</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.recommendations.map((project) => (
                  <Card
                    key={project.id}
                    className="hover:border-primary/50 transition-colors"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-medium line-clamp-2">
                          {project.title}
                        </CardTitle>
                        {project.matchScore && (
                          <Badge variant="secondary" className="shrink-0">
                            {project.matchScore}점
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{project.agency}</p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-sm mb-4">
                        {project.daysLeft !== null && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>D-{project.daysLeft}</span>
                          </div>
                        )}
                        {project.budget && (
                          <span className="text-muted-foreground">
                            최대 {(project.budget / 100000000).toFixed(1)}억원
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <Link href={`/projects/${project.id}`}>
                            상세보기
                          </Link>
                        </Button>
                        <Button size="sm" className="flex-1" asChild>
                          <Link href={`/projects/${project.id}?action=start`}>
                            지원 준비
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
