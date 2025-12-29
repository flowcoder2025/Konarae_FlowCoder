import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getOrCreateCredit } from "@/lib/credits";
import { createLogger } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { calculateDaysLeft, formatOrganization } from "@/lib/utils";
import {
  WelcomeHero,
  NextActionGuide,
  MatchingPreview,
  ActiveProjectsSummary,
} from "@/components/home";

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
    companyId?: string;
    matchingResultId?: string;
  }>;
  activeProjects: Array<{
    id: string;
    projectName: string;
    companyName: string;
    currentStep: number;
    status: string;
    deadline: string | null;
    daysLeft: number | null;
  }>;
  pendingTasks: Array<{
    type: "company" | "diagnosis" | "plan" | "verify" | "deadline";
    projectId?: string;
    projectName?: string;
    description: string;
    urgency?: "high" | "medium" | "low";
    daysLeft?: number;
  }>;
}

async function getHomeData(userId: string): Promise<HomeData> {
  // Parallel data fetching - all queries run concurrently
  const [user, userCompanies, userProjects, matchingResults, upcomingProjects, creditData] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    prisma.companyMember.findMany({
      where: { userId },
      include: { company: true },
    }),
    // 실제 UserProject 레코드 조회 (진행 중인 프로젝트)
    prisma.userProject.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { notIn: ["closed"] },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            deadline: true,
          },
        },
        company: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    // 추천 매칭 결과 조회
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
            sourceUrl: true,
            deadline: true,
            amountMax: true,
          },
        },
        company: { select: { id: true, name: true } },
      },
      orderBy: { totalScore: "desc" },
      take: 6,
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
      take: 6,
    }),
    getOrCreateCredit(userId),
  ]);

  const hasCompany = userCompanies.length > 0;

  // Build recommendations from matching results or upcoming projects
  const recommendations = matchingResults.length > 0
    ? matchingResults.map((m) => ({
        id: m.project.id,
        title: m.project.name,
        agency: formatOrganization(m.project.organization, m.project.sourceUrl),
        deadline: m.project.deadline?.toISOString() || null,
        daysLeft: calculateDaysLeft(m.project.deadline),
        budget: m.project.amountMax ? Number(m.project.amountMax) : null,
        matchScore: m.totalScore,
        companyId: m.companyId,
        matchingResultId: m.id,
      }))
    : upcomingProjects.map((p) => ({
        id: p.id,
        title: p.name,
        agency: formatOrganization(p.organization, p.sourceUrl),
        deadline: p.deadline?.toISOString() || null,
        daysLeft: calculateDaysLeft(p.deadline),
        budget: p.amountMax ? Number(p.amountMax) : null,
      }));

  // Build pending tasks based on user state
  const pendingTasks: HomeData["pendingTasks"] = [];

  if (!hasCompany) {
    pendingTasks.push({
      type: "company",
      description: "기업 정보를 등록하면 맞춤 추천을 받을 수 있어요",
    });
  }

  // Add deadline alerts as tasks
  upcomingProjects
    .filter((p) => {
      const days = calculateDaysLeft(p.deadline);
      return days !== null && days <= 7;
    })
    .slice(0, 2)
    .forEach((p) => {
      const days = calculateDaysLeft(p.deadline)!;
      pendingTasks.push({
        type: "deadline",
        projectId: p.id,
        projectName: p.name,
        description: `마감 ${days}일 전`,
        urgency: days <= 3 ? "high" : "medium",
        daysLeft: days,
      });
    });

  // Map status to step number
  const statusToStep: Record<string, number> = {
    exploring: 1,
    preparing: 2,
    writing: 3,
    verifying: 4,
    submitted: 5,
  };

  return {
    user: {
      name: user?.name || null,
      hasCompany,
      creditBalance: creditData.balance,
    },
    recommendations,
    // 실제 UserProject 레코드 사용 (진행 중인 프로젝트)
    activeProjects: userProjects.map((up) => ({
      id: up.id, // UserProject.id 사용 - /my-projects/[id]와 일치
      projectName: up.project.name,
      companyName: up.company.name,
      currentStep: statusToStep[up.status] || 1,
      status: up.status.toUpperCase(), // 컴포넌트 호환성 위해 대문자로
      deadline: up.project.deadline?.toISOString() || null,
      daysLeft: calculateDaysLeft(up.project.deadline),
    })),
    pendingTasks,
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

  if (error || !data) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      </div>
    );
  }

  const showOnboarding = !data.user.hasCompany;

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-7xl">
      {/* Header Row: Welcome + Credits */}
      <div className="flex items-start justify-between gap-4">
        {!showOnboarding && (
          <WelcomeHero
            userName={data.user.name}
            hasCompany={data.user.hasCompany}
          />
        )}
        {!showOnboarding && (
          <Badge variant="outline" className="text-sm shrink-0">
            <Sparkles className="h-3 w-3 mr-1" />
            {data.user.creditBalance.toLocaleString()}C
          </Badge>
        )}
      </div>

      {/* New User Onboarding */}
      {showOnboarding && (
        <WelcomeHero
          userName={data.user.name}
          hasCompany={data.user.hasCompany}
        />
      )}

      {/* Next Action Guide */}
      <NextActionGuide
        tasks={data.pendingTasks}
        hasCompany={data.user.hasCompany}
      />

      {/* Active Projects */}
      <ActiveProjectsSummary projects={data.activeProjects} />

      {/* Recommendations */}
      <MatchingPreview
        recommendations={data.recommendations}
        hasCompany={data.user.hasCompany}
      />
    </div>
  );
}
