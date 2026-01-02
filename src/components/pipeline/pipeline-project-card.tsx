"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2, GripVertical, Sparkles, EyeOff } from "lucide-react";
import Link from "next/link";
import { ProjectActions } from "@/components/projects/project-actions";

export interface PipelineProject {
  id: string;
  projectName: string;
  companyName: string;
  status: string;
  currentStep: number;
  deadline: string | null;
  daysLeft: number | null;
  matchScore: number;
  isHidden?: boolean;
}

interface PipelineProjectCardProps {
  project: PipelineProject;
  isDragging?: boolean;
  showActions?: boolean;
}

export function PipelineProjectCard({
  project,
  isDragging,
  showActions = true,
}: PipelineProjectCardProps) {
  const isUrgent = project.daysLeft !== null && project.daysLeft <= 7 && project.daysLeft > 0;

  return (
    <div className="relative group">
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
                {/* Project Name + Hidden Badge */}
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <p className="font-medium text-sm line-clamp-2 flex-1">
                    {project.projectName}
                  </p>
                  {project.isHidden && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      <EyeOff className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                </div>

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
      {/* Actions Menu - positioned absolute */}
      {showActions && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ProjectActions
            projectId={project.id}
            projectName={project.projectName}
            isHidden={project.isHidden}
          />
        </div>
      )}
    </div>
  );
}
