import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ClipboardCheck,
  FileCheck,
  Package,
  CheckCircle2,
  Circle,
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Coins,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

const logger = createLogger({ page: "my-project-detail" });

// Step configuration
const STEPS = [
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

      {/* Progress Stepper */}
      <Card>
        <CardHeader>
          <CardTitle>진행 현황</CardTitle>
          <CardDescription>
            5단계를 완료하면 제출 준비가 끝납니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop Stepper */}
          <div className="hidden md:flex items-center justify-between">
            {STEPS.map((step, idx) => {
              const isCompleted = project.stepCompletions[idx];
              const isCurrent = project.currentStep === step.number;
              const isLocked = project.currentStep < step.number;
              const StepIcon = step.icon;

              return (
                <div key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`
                        w-12 h-12 rounded-full flex items-center justify-center mb-2
                        ${isCompleted ? "bg-primary text-primary-foreground" : ""}
                        ${isCurrent ? "bg-primary/10 text-primary ring-2 ring-primary" : ""}
                        ${isLocked ? "bg-muted text-muted-foreground" : ""}
                      `}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-6 w-6" />
                      ) : (
                        <StepIcon className="h-6 w-6" />
                      )}
                    </div>
                    <span className={`text-sm font-medium ${isLocked ? "text-muted-foreground" : ""}`}>
                      {step.label}
                    </span>
                    {step.creditCost && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Coins className="h-3 w-3" />
                        {step.creditCost}C
                      </span>
                    )}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 ${
                        project.stepCompletions[idx] ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile Progress */}
          <div className="md:hidden space-y-3">
            {STEPS.map((step) => {
              const isCompleted = project.stepCompletions[step.number - 1];
              const isCurrent = project.currentStep === step.number;
              const isLocked = project.currentStep < step.number;
              const StepIcon = step.icon;

              return (
                <div
                  key={step.number}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg
                    ${isCurrent ? "bg-primary/10 ring-1 ring-primary" : ""}
                    ${isLocked ? "opacity-50" : ""}
                  `}
                >
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center shrink-0
                      ${isCompleted ? "bg-primary text-primary-foreground" : "bg-muted"}
                    `}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {step.description}
                    </p>
                  </div>
                  {step.creditCost && (
                    <Badge variant="outline" className="shrink-0">
                      <Coins className="h-3 w-3 mr-1" />
                      {step.creditCost}C
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Action Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
              {project.currentStep}
            </div>
            <div>
              <CardTitle>{STEPS[project.currentStep - 1].label}</CardTitle>
              <CardDescription>
                {STEPS[project.currentStep - 1].description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.currentStep === 1 && (
            <>
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">공고 내용을 확인해주세요</p>
                    <p className="text-sm text-muted-foreground">
                      지원자격, 필수 제출서류, 마감일 등을 꼼꼼히 확인하세요
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {project.projectUrl && (
                  <Button variant="outline" asChild>
                    <a href={project.projectUrl} target="_blank" rel="noopener noreferrer">
                      공고 원문 확인하기
                      <ExternalLink className="h-4 w-4 ml-2" />
                    </a>
                  </Button>
                )}
                <Button>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  확인 완료, 다음 단계로
                </Button>
              </div>
            </>
          )}

          {project.currentStep === 2 && (
            <>
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">AI 부족항목 진단</p>
                    <p className="text-sm text-muted-foreground">
                      공고 요구사항과 기업 정보를 비교해 부족한 증빙과 정보를 찾아드려요
                    </p>
                  </div>
                </div>
              </div>
              <Button>
                <Coins className="h-4 w-4 mr-2" />
                진단 시작하기 (50C)
              </Button>
            </>
          )}

          {project.currentStep >= 3 && (
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-muted-foreground">
                이 기능은 곧 제공될 예정입니다
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
