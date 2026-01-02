import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
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

// Date 또는 문자열을 안전하게 ISO 문자열로 변환
// unstable_cache에서 Date가 문자열로 직렬화되는 문제 해결
function toISOStringOrNull(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === "string") return date;
  if (date instanceof Date) return date.toISOString();
  return null;
}

// Date 또는 문자열을 Date 객체로 변환 (calculateDaysLeft용)
function toDateOrNull(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === "string") return new Date(date);
  return null;
}

// 마감 임박 프로젝트 캐싱 (5분 TTL) - 모든 사용자에게 동일
const getUpcomingProjects = unstable_cache(
  async () => {
    return prisma.supportProject.findMany({
      where: {
        deadline: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        status: "active",
        isCanonical: true,
      },
      orderBy: { deadline: "asc" },
      take: 6,
    });
  },
  ["upcoming-projects"],
  { revalidate: 300, tags: ["upcoming-projects"] } // 5분 캐시
);

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
  // Parallel data fetching with individual error handling
  // Promise.allSettled를 사용하여 개별 쿼리 실패 시에도 계속 진행
  const queryNames = ["user", "companyMember", "userProject", "matchingResult", "upcomingProjects", "credit"];

  const results = await Promise.allSettled([
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
    getUpcomingProjects(), // 5분 캐시된 마감 임박 프로젝트
    getOrCreateCredit(userId),
  ]);

  // 실패한 쿼리 로깅
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(`Query ${queryNames[index]} failed`, {
        error: result.reason,
        userId,
      });
    }
  });

  // 각 결과 추출 (실패 시 기본값 사용)
  const user = results[0].status === "fulfilled" ? results[0].value : null;
  const userCompanies = results[1].status === "fulfilled" ? results[1].value : [];
  const userProjects = results[2].status === "fulfilled" ? results[2].value : [];
  const matchingResults = results[3].status === "fulfilled" ? results[3].value : [];
  const upcomingProjects = results[4].status === "fulfilled" ? results[4].value : [];
  const creditData = results[5].status === "fulfilled"
    ? results[5].value
    : { balance: 0, totalPurchased: 0, totalUsed: 0 };

  const hasCompany = userCompanies.length > 0;

  // Build recommendations from matching results or upcoming projects
  // 중복 프로젝트 제거: 동일 project.id가 여러 번 매칭된 경우 점수가 가장 높은 것만 유지
  // 방어적 코딩: null/undefined 필터링
  const validMatchingResults = matchingResults.filter(
    (m) => m && m.project && m.project.id
  );

  const uniqueMatchingResults = validMatchingResults.reduce((acc, m) => {
    const existing = acc.find((item) => item.project.id === m.project.id);
    if (!existing || m.totalScore > existing.totalScore) {
      return [...acc.filter((item) => item.project.id !== m.project.id), m];
    }
    return acc;
  }, [] as typeof validMatchingResults);

  // upcomingProjects도 방어적 필터링
  const validUpcomingProjects = upcomingProjects.filter(
    (p) => p && p.id && p.name
  );

  const recommendations = uniqueMatchingResults.length > 0
    ? uniqueMatchingResults.map((m) => ({
        id: m.project.id,
        title: m.project.name,
        agency: formatOrganization(m.project.organization, m.project.sourceUrl),
        deadline: toISOStringOrNull(m.project.deadline),
        daysLeft: calculateDaysLeft(toDateOrNull(m.project.deadline)),
        budget: m.project.amountMax ? Number(m.project.amountMax) : null,
        matchScore: m.totalScore,
        companyId: m.companyId,
        matchingResultId: m.id,
      }))
    : validUpcomingProjects.map((p) => ({
        id: p.id,
        title: p.name,
        agency: formatOrganization(p.organization, p.sourceUrl),
        deadline: toISOStringOrNull(p.deadline),
        daysLeft: calculateDaysLeft(toDateOrNull(p.deadline)),
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

  // Add tasks from active projects based on status
  userProjects.forEach((up) => {
    const statusTaskMap: Record<string, { type: "diagnosis" | "plan" | "verify"; description: string }> = {
      exploring: { type: "diagnosis", description: "진단을 시작해주세요" },
      preparing: { type: "plan", description: "사업계획서를 작성해주세요" },
      writing: { type: "verify", description: "계획서 검증을 진행해주세요" },
    };

    const taskInfo = statusTaskMap[up.status];
    if (taskInfo) {
      pendingTasks.push({
        type: taskInfo.type,
        projectId: up.id,
        projectName: up.project.name,
        description: taskInfo.description,
        urgency: "medium",
        daysLeft: calculateDaysLeft(toDateOrNull(up.project.deadline)) ?? undefined,
      });
    }
  });

  // Add deadline alerts as tasks (only if not already added as project task)
  const existingProjectIds = new Set(pendingTasks.map(t => t.projectId).filter(Boolean));
  upcomingProjects
    .filter((p) => {
      const days = calculateDaysLeft(toDateOrNull(p.deadline));
      return days !== null && days <= 7 && !existingProjectIds.has(p.id);
    })
    .slice(0, 2)
    .forEach((p) => {
      const days = calculateDaysLeft(toDateOrNull(p.deadline))!;
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
      deadline: toISOStringOrNull(up.project.deadline),
      daysLeft: calculateDaysLeft(toDateOrNull(up.project.deadline)),
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
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      </div>
    );
  }

  const showOnboarding = !data.user.hasCompany;

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-6xl">
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
