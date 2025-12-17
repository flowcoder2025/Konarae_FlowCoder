"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateKST } from "@/lib/utils";
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
    fundingSummary?: string | null;
    deadline?: Date | null;
    isPermanent?: boolean;
    summary: string;
    viewCount: number;
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

  // 카테고리별 색상 매핑
  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      인력: "bg-blue-100 text-blue-800 border-blue-200",
      수출: "bg-green-100 text-green-800 border-green-200",
      창업: "bg-purple-100 text-purple-800 border-purple-200",
      기술: "bg-orange-100 text-orange-800 border-orange-200",
      자금: "bg-yellow-100 text-yellow-800 border-yellow-200",
      판로: "bg-pink-100 text-pink-800 border-pink-200",
      경영: "bg-cyan-100 text-cyan-800 border-cyan-200",
      "R&D": "bg-indigo-100 text-indigo-800 border-indigo-200",
    };
    return colors[cat] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="p-4 sm:p-6 hover:border-primary transition-colors cursor-pointer h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
              <Badge className={`text-xs sm:text-sm ${getCategoryColor(project.category)}`}>
                {project.category}
              </Badge>
              {project.region && project.region !== "전국" && (
                <Badge variant="outline" className="text-xs sm:text-sm">{project.region}</Badge>
              )}
              {isDeadlineSoon && !project.isPermanent && (
                <Badge variant="destructive" className="text-xs sm:text-sm">마감임박</Badge>
              )}
            </div>
            <h3 className="font-semibold text-base sm:text-lg line-clamp-2 min-h-[2.75rem] sm:min-h-[3.5rem]">
              {project.name}
            </h3>
          </div>
        </div>

        {/* Organization */}
        <div className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
          <span>{project.organization}</span>
        </div>

        {/* Summary */}
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-3 sm:mb-4 flex-grow min-h-[2rem] sm:min-h-[2.5rem]">
          {project.summary}
        </p>

        {/* Funding Summary */}
        <div className="mb-3 sm:mb-4 min-h-[1.25rem] sm:min-h-[1.5rem]">
          {project.fundingSummary ? (
            <span className="text-xs sm:text-sm font-medium text-primary line-clamp-1">
              {project.fundingSummary}
            </span>
          ) : project.amountMin && project.amountMax ? (
            <span className="text-xs sm:text-sm font-medium text-primary">
              {formatAmount(project.amountMin)} ~ {formatAmount(project.amountMax)}
            </span>
          ) : (
            <span className="text-xs sm:text-sm text-muted-foreground">금액 미정</span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs sm:text-sm pt-2 sm:pt-3 border-t">
          <div className="text-muted-foreground">
            {project.isPermanent ? (
              <span>상시모집</span>
            ) : project.deadline ? (
              <span>~{formatDateKST(project.deadline)}</span>
            ) : (
              <span>기한 미정</span>
            )}
          </div>
          <span className="text-muted-foreground">
            조회 {project.viewCount}
          </span>
        </div>
      </Card>
    </Link>
  );
}
