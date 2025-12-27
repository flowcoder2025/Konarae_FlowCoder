import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Kanban,
  Plus,
  Calendar,
  Building2,
  GripVertical,
  MoreHorizontal,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const logger = createLogger({ page: "pipeline" });

// Pipeline columns configuration
const PIPELINE_COLUMNS = [
  { id: "EXPLORING", label: "탐색 중", color: "bg-blue-500" },
  { id: "PREPARING", label: "진단/준비", color: "bg-yellow-500" },
  { id: "WRITING", label: "작성 중", color: "bg-purple-500" },
  { id: "VERIFYING", label: "검증 중", color: "bg-orange-500" },
  { id: "SUBMITTED", label: "제출 완료", color: "bg-green-500" },
];

interface PipelineProject {
  id: string;
  projectName: string;
  companyName: string;
  status: string;
  currentStep: number;
  deadline: string | null;
  daysLeft: number | null;
  matchScore: number;
}

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
            모든 프로젝트를 한눈에 관리하세요 ({totalProjects}개)
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

      {/* Empty State */}
      {totalProjects === 0 && !error && (
        <Card>
          <CardContent className="py-16 text-center">
            <Kanban className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              파이프라인이 비어있습니다
            </h2>
            <p className="text-muted-foreground mb-6">
              지원사업을 찾아 첫 프로젝트를 시작해보세요
            </p>
            <Button asChild size="lg">
              <Link href="/projects">
                지원사업 둘러보기
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      {totalProjects > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_COLUMNS.map((column) => {
            const projects = pipelineData[column.id] || [];
            return (
              <div
                key={column.id}
                className="flex-shrink-0 w-[300px] bg-muted/30 rounded-lg p-3"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${column.color}`} />
                    <h3 className="font-semibold">{column.label}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {projects.length}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>

                {/* Column Content */}
                <div className="space-y-2 min-h-[200px]">
                  {projects.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      프로젝트 없음
                    </div>
                  ) : (
                    projects.map((project) => (
                      <Link key={project.id} href={`/my-projects/${project.id}`}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm line-clamp-2 mb-1">
                                  {project.projectName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1 truncate">
                                    <Building2 className="h-3 w-3" />
                                    {project.companyName}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  {project.daysLeft !== null && project.daysLeft > 0 && (
                                    <Badge
                                      variant={project.daysLeft <= 7 ? "destructive" : "outline"}
                                      className="text-xs"
                                    >
                                      <Calendar className="h-3 w-3 mr-1" />
                                      D-{project.daysLeft}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {project.matchScore}점
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {totalProjects > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>상태:</span>
          {PIPELINE_COLUMNS.map((column) => (
            <div key={column.id} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${column.color}`} />
              <span>{column.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
