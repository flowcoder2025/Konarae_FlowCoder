"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2, GripVertical, Sparkles } from "lucide-react";
import Link from "next/link";

export interface PipelineProject {
  id: string;
  projectName: string;
  companyName: string;
  status: string;
  currentStep: number;
  deadline: string | null;
  daysLeft: number | null;
  matchScore: number;
}

interface PipelineProjectCardProps {
  project: PipelineProject;
  isDragging?: boolean;
}

export function PipelineProjectCard({ project, isDragging }: PipelineProjectCardProps) {
  const isUrgent = project.daysLeft !== null && project.daysLeft <= 7 && project.daysLeft > 0;

  return (
    <Link href={`/my-projects/${project.id}`}>
      <Card
        className={`
          hover:border-primary/50 transition-all cursor-pointer
          ${isDragging ? "shadow-lg ring-2 ring-primary/20" : ""}
        `}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab shrink-0" />
            <div className="flex-1 min-w-0">
              {/* Project Name */}
              <p className="font-medium text-sm line-clamp-2 mb-1.5">
                {project.projectName}
              </p>

              {/* Company */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{project.companyName}</span>
              </div>

              {/* Footer: Deadline + Score */}
              <div className="flex items-center justify-between gap-2">
                {project.daysLeft !== null && project.daysLeft > 0 ? (
                  <Badge
                    variant={isUrgent ? "destructive" : "outline"}
                    className="text-xs px-1.5 py-0"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    D-{project.daysLeft}
                  </Badge>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>{project.matchScore}점</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(project.currentStep / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
