"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Plus } from "lucide-react";
import { PipelineProjectCard } from "./pipeline-project-card";
import type { PipelineProject } from "./pipeline-project-card";

export interface ColumnConfig {
  id: string;
  label: string;
  color: string;
}

interface PipelineColumnProps {
  column: ColumnConfig;
  projects: PipelineProject[];
  onAddProject?: () => void;
}

export function PipelineColumn({ column, projects, onAddProject }: PipelineColumnProps) {
  return (
    <div className="flex-shrink-0 w-[300px] bg-muted/30 rounded-lg flex flex-col max-h-[calc(100vh-250px)]">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${column.color}`} />
          <h3 className="font-semibold">{column.label}</h3>
          <Badge variant="secondary" className="text-xs">
            {projects.length}
          </Badge>
        </div>
        <div className="flex items-center">
          {onAddProject && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onAddProject}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Column Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2 min-h-[100px]">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
              <p>프로젝트 없음</p>
              {column.id === "EXPLORING" && onAddProject && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={onAddProject}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  추가하기
                </Button>
              )}
            </div>
          ) : (
            projects.map((project) => (
              <PipelineProjectCard key={project.id} project={project} />
            ))
          )}
        </div>
      </div>

      {/* Column Footer - Stats */}
      {projects.length > 0 && (
        <div className="p-3 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>총 {projects.length}개</span>
            {projects.some((p) => p.daysLeft !== null && p.daysLeft <= 7 && p.daysLeft > 0) && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                긴급 {projects.filter((p) => p.daysLeft !== null && p.daysLeft <= 7 && p.daysLeft > 0).length}개
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
