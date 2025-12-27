import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Kanban, Plus } from "lucide-react";
import Link from "next/link";
import { PipelineBoard } from "@/components/pipeline";
import type { PipelineProject } from "@/components/pipeline";

const logger = createLogger({ page: "pipeline" });

async function getPipelineData(userId: string): Promise<Record<string, PipelineProject[]>> {
  const userCompanies = await prisma.companyMember.findMany({
    where: { userId },
    select: { companyId: true },
  });

  const companyIds = userCompanies.map((cm) => cm.companyId);

  const matchingResults = await prisma.matchingResult.findMany({
    where: { companyId: { in: companyIds } },
    include: {
      company: { select: { name: true } },
      project: {
        select: {
          name: true,
          deadline: true,
        },
      },
    },
    orderBy: { totalScore: "desc" },
  });

  // Group by status (for now, all are EXPLORING since we don't have UserProject yet)
  const grouped: Record<string, PipelineProject[]> = {
    EXPLORING: [],
    PREPARING: [],
    WRITING: [],
    VERIFYING: [],
    SUBMITTED: [],
  };

  matchingResults.forEach((m) => {
    const project: PipelineProject = {
      id: m.id,
      projectName: m.project.name,
      companyName: m.company.name,
      status: "EXPLORING",
      currentStep: 1,
      deadline: m.project.deadline?.toISOString() || null,
      daysLeft: m.project.deadline
        ? Math.ceil((new Date(m.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      matchScore: m.totalScore,
    };
    grouped.EXPLORING.push(project);
  });

  return grouped;
}

export default async function PipelinePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let pipelineData: Record<string, PipelineProject[]> = {};
  let error = false;

  try {
    pipelineData = await getPipelineData(session.user.id);
  } catch (e) {
    logger.error("Failed to load pipeline data", { error: e });
    error = true;
  }

  const totalProjects = Object.values(pipelineData).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Kanban className="h-8 w-8 text-primary" />
            파이프라인
          </h1>
          <p className="mt-1 text-muted-foreground">
            모든 프로젝트를 한눈에 관리하세요
          </p>
        </div>
        <Button asChild>
          <Link href="/projects">
            <Plus className="h-4 w-4 mr-2" />
            새 프로젝트
          </Link>
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      )}

      {/* Pipeline Board */}
      {!error && <PipelineBoard data={pipelineData} />}
    </div>
  );
}
