"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kanban, ArrowRight, Plus, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";
import { PipelineColumn } from "./pipeline-column";
import type { ColumnConfig } from "./pipeline-column";
import type { PipelineProject } from "./pipeline-project-card";

// Default pipeline columns configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "EXPLORING", label: "탐색 중", color: "bg-blue-500" },
  { id: "PREPARING", label: "진단/준비", color: "bg-yellow-500" },
  { id: "WRITING", label: "작성 중", color: "bg-purple-500" },
  { id: "VERIFYING", label: "검증 중", color: "bg-orange-500" },
  { id: "SUBMITTED", label: "제출 완료", color: "bg-green-500" },
];

interface PipelineBoardProps {
  data: Record<string, PipelineProject[]>;
  columns?: ColumnConfig[];
}

export function PipelineBoard({
  data,
  columns = DEFAULT_COLUMNS,
}: PipelineBoardProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const totalProjects = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);

  // Filter projects by search query
  const filteredData: Record<string, PipelineProject[]> = {};
  columns.forEach((column) => {
    const columnProjects = data[column.id] || [];
    if (searchQuery) {
      filteredData[column.id] = columnProjects.filter(
        (p) =>
          p.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.companyName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else {
      filteredData[column.id] = columnProjects;
    }
  });

  const filteredTotal = Object.values(filteredData).reduce((sum, arr) => sum + arr.length, 0);

  // Empty state
  if (totalProjects === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Kanban className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            파이프라인이 비어있습니다
          </h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            지원사업을 찾아 첫 프로젝트를 시작해보세요.
            모든 프로젝트 진행 상황을 한눈에 관리할 수 있습니다.
          </p>
          <Button asChild size="lg">
            <Link href="/projects">
              지원사업 둘러보기
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="프로젝트 또는 기업명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {searchQuery ? (
            <span>
              {filteredTotal} / {totalProjects}개 표시
            </span>
          ) : (
            <span>총 {totalProjects}개</span>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
        {columns.map((column) => (
          <PipelineColumn
            key={column.id}
            column={column}
            projects={filteredData[column.id] || []}
            onAddProject={column.id === "EXPLORING" ? () => {} : undefined}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
        <span className="font-medium">상태:</span>
        {columns.map((column) => (
          <div key={column.id} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
            <span>{column.label}</span>
            <span className="text-xs opacity-70">
              ({filteredData[column.id]?.length || 0})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
