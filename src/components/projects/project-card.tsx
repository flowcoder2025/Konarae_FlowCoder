"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    organization: string;
    category: string;
    subCategory?: string | null;
    target: string;
    region: string;
    amountMin?: bigint | null;
    amountMax?: bigint | null;
    amountDescription?: string | null;
    deadline?: Date | null;
    isPermanent?: boolean;
    summary: string;
    viewCount: number;
    bookmarkCount: number;
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const isDeadlineSoon = project.deadline
    ? new Date(project.deadline).getTime() - Date.now() <
      7 * 24 * 60 * 60 * 1000
    : false;

  const formatAmount = (amount: bigint) => {
    const num = Number(amount);
    if (num >= 100000000) {
      return `${(num / 100000000).toFixed(1)}억원`;
    } else if (num >= 10000) {
      return `${(num / 10000).toFixed(0)}만원`;
    }
    return `${num.toLocaleString()}원`;
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{project.category}</Badge>
              {project.subCategory && (
                <Badge variant="outline">{project.subCategory}</Badge>
              )}
              {isDeadlineSoon && !project.isPermanent && (
                <Badge variant="destructive">마감임박</Badge>
              )}
            </div>
            <h3 className="font-semibold text-lg line-clamp-2">
              {project.name}
            </h3>
          </div>
        </div>

        {/* Organization & Region */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <span>{project.organization}</span>
          <span>•</span>
          <span>{project.region}</span>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {project.summary}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            {project.amountMin && project.amountMax ? (
              <span className="font-medium text-primary">
                {formatAmount(project.amountMin)} ~{" "}
                {formatAmount(project.amountMax)}
              </span>
            ) : project.amountDescription ? (
              <span className="font-medium text-primary">
                {project.amountDescription}
              </span>
            ) : (
              <span className="text-muted-foreground">금액 미정</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            {project.isPermanent ? (
              <span className="text-xs">상시모집</span>
            ) : project.deadline ? (
              <span className="text-xs">
                ~{new Date(project.deadline).toLocaleDateString()}
              </span>
            ) : (
              <span className="text-xs">기한 미정</span>
            )}
            <span className="text-xs">조회 {project.viewCount}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
