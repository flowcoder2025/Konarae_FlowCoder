import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ClipboardCheck,
  FileCheck,
  Package,
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { ProjectWorkspace } from "@/components/projects";
import type { StepConfig } from "@/components/projects";

// Step configuration
const STEPS: StepConfig[] = [
  {
    number: 1,
    label: "공고 확인",
    description: "지원자격과 제출서류를 확인해요",
    icon: FileText,
  },
  {
    number: 2,
    label: "부족항목 진단",
    description: "AI가 부족한 정보와 증빙을 찾아드려요",
    icon: ClipboardCheck,
    creditCost: 50,
  },
  {
    number: 3,
    label: "계획서 작성",
    description: "블록 기반으로 쉽게 작성해요",
    icon: FileText,
  },
  {
    number: 4,
    label: "제출 전 검증",
    description: "AI가 최종 점검을 도와드려요",
    icon: FileCheck,
    creditCost: 30,
  },
  {
    number: 5,
    label: "패키징 & 제출",
    description: "파일을 정리하고 제출 준비를 완료해요",
    icon: Package,
  },
];

interface ProjectDetail {
  id: string;
  projectName: string;
  projectAgency: string;
  projectUrl: string | null;
  companyName: string;
  companyId: string;
  currentStep: number;
  stepCompletions: boolean[];
  deadline: string | null;
  daysLeft: number | null;
  matchScore: number;
  existingPlanId: string | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

async function getProjectDetail(userId: string, projectId: string): Promise<ProjectDetail | null> {
  // For now, use MatchingResult as the project source
  // TODO: Replace with UserProject after migration
  const matchingResult = await prisma.matchingResult.findFirst({
    where: {
      id: projectId,
      company: {
        members: { some: { userId } },
      },
    },
    include: {
      company: { select: { id: true, name: true } },
      project: {
        select: {
          name: true,
          organization: true,
          deadline: true,
          sourceUrl: true,
        },
      },
    },
  });

  if (!matchingResult) return null;

  // Check for existing business plan
  const existingPlan = await prisma.businessPlan.findFirst({
    where: {
      companyId: matchingResult.company.id,
      // Add project reference when UserProject model is available
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    id: matchingResult.id,
    projectName: matchingResult.project.name,
    projectAgency: matchingResult.project.organization,
    projectUrl: matchingResult.project.sourceUrl,
    companyName: matchingResult.company.name,
    companyId: matchingResult.company.id,
    currentStep: 1,
    stepCompletions: [false, false, false, false, false],
    deadline: matchingResult.project.deadline?.toISOString() || null,
    daysLeft: matchingResult.project.deadline
      ? Math.ceil((new Date(matchingResult.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
    matchScore: matchingResult.totalScore,
    existingPlanId: existingPlan?.id || null,
  };
}

export default async function ProjectDetailPage({ params }: Props) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const project = await getProjectDetail(session.user.id, id);

  if (!project) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Back Navigation */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/my-projects">
            <ArrowLeft className="h-4 w-4 mr-2" />
            내 프로젝트로 돌아가기
          </Link>
        </Button>
      </div>

      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{project.projectName}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {project.companyName}
              </span>
              <span>{project.projectAgency}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {project.daysLeft !== null && project.daysLeft > 0 && (
              <Badge variant={project.daysLeft <= 7 ? "destructive" : "secondary"}>
                <Calendar className="h-3 w-3 mr-1" />
                D-{project.daysLeft}
              </Badge>
            )}
            <Badge variant="outline">적합도 {project.matchScore}점</Badge>
          </div>
        </div>

        {project.projectUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={project.projectUrl} target="_blank" rel="noopener noreferrer">
              공고 원문 보기
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        )}
      </div>

      {/* Project Workspace */}
      <ProjectWorkspace
        projectId={project.id}
        projectUrl={project.projectUrl}
        companyId={project.companyId}
        existingPlanId={project.existingPlanId}
        initialStep={project.currentStep}
        initialCompletions={project.stepCompletions}
        steps={STEPS}
      />
    </div>
  );
}
