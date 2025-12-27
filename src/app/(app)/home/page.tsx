import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getOrCreateCredit } from "@/lib/credits";
import { createLogger } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
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
  ]);

  const creditData = await getOrCreateCredit(userId);
  const hasCompany = userCompanies.length > 0;

  // Build recommendations from matching results or upcoming projects
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
      if (!p.deadline) return false;
      const daysLeft = Math.ceil(
        (new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft <= 7;
    })
    .slice(0, 2)
    .forEach((p) => {
      const daysLeft = Math.ceil(
        (new Date(p.deadline!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      pendingTasks.push({
        type: "deadline",
        projectId: p.id,
        projectName: p.name,
        description: `마감 ${daysLeft}일 전`,
        urgency: daysLeft <= 3 ? "high" : "medium",
        daysLeft,
      });
    });

  return {
    user: {
      name: user?.name || null,
      hasCompany,
      creditBalance: creditData.balance,
    },
    recommendations,
    activeProjects: matchingResults.map((m) => ({
      id: m.id,
      projectName: m.project.name,
      companyName: m.company.name,
      currentStep: 1,
      status: "EXPLORING",
      deadline: m.project.deadline?.toISOString() || null,
      daysLeft: m.project.deadline
        ? Math.ceil((new Date(m.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
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
