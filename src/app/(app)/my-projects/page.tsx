import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  Plus,
  Calendar,
  Building2,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileText,
  Search,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const logger = createLogger({ page: "my-projects" });

// Step labels for display
const STEP_LABELS = [
  "공고 확인",
  "부족항목 진단",
  "계획서 작성",
  "제출 전 검증",
  "패키징 & 제출",
];

// Status colors
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  EXPLORING: { bg: "bg-blue-100", text: "text-blue-700", label: "탐색 중" },
  PREPARING: { bg: "bg-yellow-100", text: "text-yellow-700", label: "준비 중" },
  WRITING: { bg: "bg-purple-100", text: "text-purple-700", label: "작성 중" },
  VERIFYING: { bg: "bg-orange-100", text: "text-orange-700", label: "검증 중" },
  SUBMITTED: { bg: "bg-green-100", text: "text-green-700", label: "제출 완료" },
  ARCHIVED: { bg: "bg-gray-100", text: "text-gray-700", label: "보관됨" },
};

interface ProjectItem {
  id: string;
  projectName: string;
  projectAgency: string;
  companyName: string;
  currentStep: number;
  status: string;
  deadline: string | null;
  daysLeft: number | null;
  updatedAt: string;
}

async function getMyProjects(userId: string): Promise<ProjectItem[]> {
  // For now, return matching results as project-like items
  // TODO: Replace with UserProject model after migration
  const userCompanies = await prisma.companyMember.findMany({
    where: { userId },
    select: { companyId: true },
  });

  const companyIds = userCompanies.map((cm) => cm.companyId);

  const matchingResults = await prisma.matchingResult.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      id: true,
      totalScore: true,
      createdAt: true,
      company: { select: { name: true } },
      project: {
        select: {
          name: true,
          organization: true,
          deadline: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return matchingResults.map((m) => ({
    id: m.id,
    projectName: m.project.name,
    projectAgency: m.project.organization,
    companyName: m.company.name,
    currentStep: 1, // Default to step 1 for now
    status: "EXPLORING",
    deadline: m.project.deadline?.toISOString() || null,
    daysLeft: m.project.deadline
      ? Math.ceil((new Date(m.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
    updatedAt: m.createdAt.toISOString(),
  }));
}

export default async function MyProjectsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let projects: ProjectItem[] = [];
  let error = false;

  try {
    projects = await getMyProjects(session.user.id);
  } catch (e) {
    logger.error("Failed to load my projects", { error: e });
    error = true;
  }

  const activeProjects = projects.filter((p) => p.status !== "ARCHIVED" && p.status !== "SUBMITTED");
  const completedProjects = projects.filter((p) => p.status === "SUBMITTED");

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FolderKanban className="h-8 w-8 text-primary" />
            내 프로젝트
          </h1>
          <p className="mt-1 text-muted-foreground">
            지원 준비 중인 프로젝트를 관리하세요
          </p>
        </div>
        <Button asChild>
          <Link href="/projects">
            <Plus className="h-4 w-4 mr-2" />
            새 프로젝트 시작
          </Link>
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              아직 진행 중인 프로젝트가 없습니다
            </h2>
            <p className="text-muted-foreground mb-6">
              지원사업을 찾아 첫 프로젝트를 시작해보세요
            </p>
            <Button asChild size="lg">
              <Link href="/projects">
                <Search className="h-4 w-4 mr-2" />
                지원사업 둘러보기
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">진행 중 ({activeProjects.length})</h2>
          </div>
          <div className="grid gap-4">
            {activeProjects.map((project) => {
              const statusStyle = STATUS_STYLES[project.status] || STATUS_STYLES.EXPLORING;
              return (
                <Link key={project.id} href={`/my-projects/${project.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="py-5">
                      <div className="flex items-center gap-4">
                        {/* Left: Project Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{project.projectName}</h3>
                            <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>
                              {statusStyle.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {project.companyName}
                            </span>
                            <span>{project.projectAgency}</span>
                            {project.daysLeft !== null && project.daysLeft > 0 && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                D-{project.daysLeft}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Center: Progress Steps */}
                        <div className="hidden md:flex items-center gap-1">
                          {STEP_LABELS.map((label, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                idx + 1 <= project.currentStep
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {idx + 1 <= project.currentStep ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <span className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[10px]">
                                  {idx + 1}
                                </span>
                              )}
                              <span className="hidden lg:inline">{label}</span>
                            </div>
                          ))}
                        </div>

                        {/* Right: Arrow */}
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>

                      {/* Mobile Progress Bar */}
                      <div className="md:hidden mt-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(project.currentStep / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {project.currentStep}/5 단계
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Completed Projects */}
      {completedProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h2 className="text-xl font-semibold">제출 완료 ({completedProjects.length})</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedProjects.map((project) => (
              <Link key={project.id} href={`/my-projects/${project.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{project.projectName}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {project.companyName}
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">제출 완료</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick Link to Pipeline */}
      {projects.length > 0 && (
        <div className="pt-4 border-t">
          <Button variant="outline" asChild>
            <Link href="/pipeline">
              전체 현황을 칸반 보드로 보기
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
