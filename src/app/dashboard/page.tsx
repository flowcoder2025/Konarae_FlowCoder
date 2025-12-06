import { auth } from "@/lib/auth";
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

async function getDashboardData(): Promise<DashboardData> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  return res.json();
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  let data: DashboardData | null = null;
  let error = false;

  try {
    data = await getDashboardData();
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
