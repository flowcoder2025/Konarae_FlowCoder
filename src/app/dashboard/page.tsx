import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { DeadlineAlert } from "@/components/dashboard/deadline-alert";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Building2, FileCheck, FileText, Target } from "lucide-react";

interface DashboardData {
  stats: {
    companiesCount: number;
    matchingResultsCount: number;
    businessPlansCount: number;
    evaluationsCount: number;
  };
  recent: {
    matching: Array<{
      id: string;
      companyName: string;
      projectTitle: string;
      projectAgency: string;
      score: number;
      createdAt: string;
    }>;
    plans: Array<{
      id: string;
      title: string;
      companyName?: string;
      projectTitle?: string;
      status: string;
      createdAt: string;
    }>;
    evaluations: Array<{
      id: string;
      planTitle: string;
      totalScore: number | null;
      status: string;
      createdAt: string;
    }>;
  };
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    agency: string;
    deadline: string;
    budget: number | null;
    daysLeft: number;
  }>;
}

async function getDashboardData(userId: string): Promise<DashboardData> {
  // Get user's companies
  const userCompanies = await prisma.companyMember.findMany({
    where: { userId },
    select: { companyId: true },
  });

  const companyIds = userCompanies.map((cm) => cm.companyId);

  // Parallel queries for better performance
  const [
    companiesCount,
    matchingResultsCount,
    businessPlansCount,
    evaluationsCount,
    recentMatching,
    recentPlans,
    recentEvaluations,
    upcomingDeadlines,
  ] = await Promise.all([
    // Total companies user is part of
    prisma.company.count({
      where: { id: { in: companyIds } },
    }),

    // Total matching results
    prisma.matchingResult.count({
      where: { companyId: { in: companyIds } },
    }),

    // Total business plans
    prisma.businessPlan.count({
      where: {
        OR: [
          { userId },
          { companyId: { in: companyIds } },
        ],
      },
    }),

    // Total evaluations
    prisma.evaluation.count({
      where: { userId },
    }),

    // Recent 5 matching results
    prisma.matchingResult.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        company: { select: { name: true } },
        project: { select: { name: true, organization: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Recent 5 business plans
    prisma.businessPlan.findMany({
      where: {
        OR: [
          { userId },
          { companyId: { in: companyIds } },
        ],
      },
      include: {
        company: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Recent 5 evaluations
    prisma.evaluation.findMany({
      where: { userId },
      include: {
        businessPlan: {
          select: { title: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Upcoming deadlines (next 30 days)
    prisma.supportProject.findMany({
      where: {
        deadline: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        status: "active",
      },
      select: {
        id: true,
        name: true,
        organization: true,
        deadline: true,
        amountMax: true,
      },
      orderBy: { deadline: "asc" },
      take: 5,
    }),
  ]);

  return {
    stats: {
      companiesCount,
      matchingResultsCount,
      businessPlansCount,
      evaluationsCount,
    },
    recent: {
      matching: recentMatching.map((m) => ({
        id: m.id,
        companyName: m.company.name,
        projectTitle: m.project.name,
        projectAgency: m.project.organization,
        score: m.totalScore,
        createdAt: m.createdAt.toISOString(),
      })),
      plans: recentPlans.map((p) => ({
        id: p.id,
        title: p.title,
        companyName: p.company?.name,
        projectTitle: p.project?.name,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      evaluations: recentEvaluations.map((e) => ({
        id: e.id,
        planTitle: e.businessPlan?.title || "외부 파일",
        totalScore: e.totalScore,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
      })),
    },
    upcomingDeadlines: upcomingDeadlines.map((p) => ({
      id: p.id,
      title: p.name,
      agency: p.organization,
      deadline: p.deadline!.toISOString(),
      budget: p.amountMax ? Number(p.amountMax) : null,
      daysLeft: Math.ceil(
        (new Date(p.deadline!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    })),
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let data: DashboardData | null = null;
  let error = false;

  try {
    data = await getDashboardData(session.user.id);
  } catch (e) {
    console.error("Failed to load dashboard:", e);
    error = true;
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">대시보드</h1>
        <p className="mt-2 text-muted-foreground">
          환영합니다, {session.user?.name}님!
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      )}

      {data && (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="등록된 기업"
              value={data.stats.companiesCount}
              icon={Building2}
              description="관리 중인 기업 수"
            />
            <StatCard
              title="매칭 결과"
              value={data.stats.matchingResultsCount}
              icon={Target}
              description="추천받은 지원사업"
            />
            <StatCard
              title="사업계획서"
              value={data.stats.businessPlansCount}
              icon={FileText}
              description="작성 중 및 완료"
            />
            <StatCard
              title="평가 완료"
              value={data.stats.evaluationsCount}
              icon={FileCheck}
              description="평가받은 계획서"
            />
          </div>

          {/* Deadline Alerts */}
          {data.upcomingDeadlines.length > 0 && (
            <DeadlineAlert deadlines={data.upcomingDeadlines} />
          )}

          {/* Quick Actions */}
          <QuickActions />

          {/* Recent Activities */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <RecentActivity
              title="최근 매칭 결과"
              items={data.recent.matching.map((m) => ({
                id: m.id,
                title: m.projectTitle,
                subtitle: `${m.companyName} · ${m.projectAgency}`,
                score: m.score,
                createdAt: m.createdAt,
                href: `/matching/results/${m.id}`,
              }))}
              emptyMessage="아직 매칭 결과가 없습니다"
              viewAllHref="/matching/results"
            />

            <RecentActivity
              title="최근 사업계획서"
              items={data.recent.plans.map((p) => ({
                id: p.id,
                title: p.title,
                subtitle: p.companyName || p.projectTitle,
                status: p.status,
                createdAt: p.createdAt,
                href: `/business-plans/${p.id}`,
              }))}
              emptyMessage="아직 작성한 사업계획서가 없습니다"
              viewAllHref="/business-plans"
            />

            <RecentActivity
              title="최근 평가 결과"
              items={data.recent.evaluations.map((e) => ({
                id: e.id,
                title: e.planTitle,
                score: e.totalScore || undefined,
                status: e.status,
                createdAt: e.createdAt,
                href: `/evaluations/${e.id}`,
              }))}
              emptyMessage="아직 평가 결과가 없습니다"
              viewAllHref="/evaluations"
            />
          </div>
        </>
      )}
    </div>
  );
}
