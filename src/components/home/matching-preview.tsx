"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Calendar,
  TrendingUp,
  FolderOpen,
  Sparkles,
  Building,
  Coins,
  Rocket,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useStartProject } from "@/hooks/use-user-project";

interface RecommendedProject {
  id: string;
  title: string;
  agency: string;
  deadline: string | null;
  daysLeft: number | null;
  budget: number | null;
  matchScore?: number;
  companyId?: string;
  matchingResultId?: string;
}

interface MatchingPreviewProps {
  recommendations: RecommendedProject[];
  hasCompany: boolean;
}

export function MatchingPreview({ recommendations, hasCompany }: MatchingPreviewProps) {
  // No company - show empty state with CTA
  if (!hasCompany) {
    return null; // WelcomeHero handles this case
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          맞춤 추천 지원사업
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link href="/matching">
            전체 보기
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>

      {recommendations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">추천 지원사업이 없습니다</h3>
            <p className="text-sm text-muted-foreground mb-4">
              기업 정보를 보완하면 더 정확한 추천을 받을 수 있어요
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/company">기업 정보 보완</Link>
              </Button>
              <Button asChild>
                <Link href="/projects">지원사업 둘러보기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((project) => (
            <ProjectRecommendationCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectRecommendationCard({ project }: { project: RecommendedProject }) {
  const isUrgent = project.daysLeft !== null && project.daysLeft <= 7;
  const { startProject, isLoading } = useStartProject();
  const canStartProject = Boolean(project.companyId);

  const handleStartProject = async () => {
    if (!project.companyId) return;
    await startProject(project.companyId, project.id, project.matchingResultId);
  };

  return (
    <Card className="hover:border-primary/50 transition-colors group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {project.matchScore && (
              <div className="flex items-center gap-1 mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  <Sparkles className="h-3 w-3 mr-1" />
                  적합도 {project.matchScore}점
                </Badge>
                {isUrgent && (
                  <Badge variant="destructive">
                    D-{project.daysLeft}
                  </Badge>
                )}
              </div>
            )}
            <CardTitle className="text-base font-medium line-clamp-2 group-hover:text-primary transition-colors">
              {project.title}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Building className="h-4 w-4" />
            {project.agency}
          </span>
          {project.daysLeft !== null && !isUrgent && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              D-{project.daysLeft}
            </span>
          )}
          {project.budget && (
            <span className="flex items-center gap-1">
              <Coins className="h-4 w-4" />
              최대 {formatBudget(project.budget)}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href={`/projects/${project.id}`}>
              상세보기
            </Link>
          </Button>
          {canStartProject ? (
            <Button
              size="sm"
              className="flex-1"
              onClick={handleStartProject}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-1" />
              )}
              {isLoading ? "시작 중..." : "지원 준비"}
            </Button>
          ) : (
            <Button size="sm" className="flex-1" asChild>
              <Link href={`/projects/${project.id}?action=start`}>
                지원 준비
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatBudget(amount: number): string {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}억원`;
  } else if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}만원`;
  }
  return `${amount.toLocaleString()}원`;
}
