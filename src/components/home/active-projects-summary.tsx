"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface ActiveProject {
  id: string;
  projectName: string;
  companyName: string;
  currentStep: number;
  status: string;
  deadline?: string | null;
  daysLeft?: number | null;
}

interface ActiveProjectsSummaryProps {
  projects: ActiveProject[];
}

const STEP_LABELS = ["공고확인", "진단", "계획서", "검증", "제출"];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  EXPLORING: { bg: "bg-blue-100", text: "text-blue-700", label: "탐색 중" },
  PREPARING: { bg: "bg-yellow-100", text: "text-yellow-700", label: "준비 중" },
  WRITING: { bg: "bg-purple-100", text: "text-purple-700", label: "작성 중" },
  VERIFYING: { bg: "bg-orange-100", text: "text-orange-700", label: "검증 중" },
  SUBMITTED: { bg: "bg-green-100", text: "text-green-700", label: "제출 완료" },
};

export function ActiveProjectsSummary({ projects }: ActiveProjectsSummaryProps) {
  if (projects.length === 0) {
    return null;
  }

  const activeProjects = projects.filter(
    (p) => p.status !== "SUBMITTED" && p.status !== "ARCHIVED"
  );

  if (activeProjects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          진행 중인 프로젝트
          <Badge variant="secondary">{activeProjects.length}</Badge>
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link href="/my-projects">
            전체보기
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {activeProjects.slice(0, 3).map((project) => (
          <ActiveProjectCard key={project.id} project={project} />
        ))}
      </div>

      {activeProjects.length > 3 && (
        <div className="text-center">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/my-projects">
              {activeProjects.length - 3}개 프로젝트 더보기
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function ActiveProjectCard({ project }: { project: ActiveProject }) {
  const statusStyle = STATUS_STYLES[project.status] || STATUS_STYLES.EXPLORING;
  const progress = (project.currentStep / 5) * 100;
  const isUrgent = project.daysLeft != null && project.daysLeft <= 7;

  return (
    <Link href={`/my-projects/${project.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardContent className="py-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </Badge>
            {isUrgent && (
              <Badge variant="destructive">
                <Calendar className="h-3 w-3 mr-1" />
                D-{project.daysLeft}
              </Badge>
            )}
          </div>

          {/* Project Name */}
          <h3 className="font-medium line-clamp-2 mb-2">{project.projectName}</h3>

          {/* Company */}
          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
            <Building2 className="h-3 w-3" />
            {project.companyName}
          </p>

          {/* Progress */}
          <div className="mt-auto space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {project.currentStep}/5
              </span>
            </div>

            {/* Current Step */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {STEP_LABELS[project.currentStep - 1]} 진행 중
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
