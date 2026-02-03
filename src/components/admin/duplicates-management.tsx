"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  RefreshCw,
  Unlink,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  organization: string;
  region: string;
  isCanonical: boolean;
  sourceUrl: string | null;
  createdAt: string;
}

interface DuplicateGroup {
  id: string;
  normalizedName: string;
  projectYear: number | null;
  region: string;
  sourceCount: number;
  mergeConfidence: number;
  reviewStatus: string;
  canonicalProject: {
    id: string;
    name: string;
    organization: string;
    region: string;
    deadline: string | null;
    category: string;
  } | null;
  projects: Project[];
  createdAt: string;
  updatedAt: string;
}

interface DuplicatesData {
  groups: DuplicateGroup[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  stats: {
    total: number;
    byStatus: Record<string, number>;
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: "자동", color: "bg-blue-100 text-blue-800" },
  pending_review: { label: "검토 필요", color: "bg-yellow-100 text-yellow-800" },
  confirmed: { label: "확인됨", color: "bg-green-100 text-green-800" },
  rejected: { label: "거부됨", color: "bg-red-100 text-red-800" },
};

export function DuplicatesManagement() {
  const [data, setData] = useState<DuplicatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/admin/duplicates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch duplicates");
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleAction = async (
    groupId: string,
    action: string,
    payload: Record<string, unknown> = {}
  ) => {
    try {
      setActionLoading(`${groupId}-${action}`);
      const res = await fetch("/api/admin/duplicates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, action, ...payload }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Action failed");
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>데이터를 불러오는데 실패했습니다: {error}</span>
        </div>
        <Button onClick={fetchData} variant="outline" className="mt-4">
          다시 시도
        </Button>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">전체 그룹</div>
          <div className="text-2xl font-bold">{data.stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">자동 병합</div>
          <div className="text-2xl font-bold text-blue-600">
            {data.stats.byStatus.auto || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">검토 필요</div>
          <div className="text-2xl font-bold text-yellow-600">
            {data.stats.byStatus.pending_review || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">확인됨</div>
          <div className="text-2xl font-bold text-green-600">
            {data.stats.byStatus.confirmed || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">거부됨</div>
          <div className="text-2xl font-bold text-red-600">
            {data.stats.byStatus.rejected || 0}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">상태:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="pending_review">검토 필요</SelectItem>
              <SelectItem value="auto">자동</SelectItem>
              <SelectItem value="confirmed">확인됨</SelectItem>
              <SelectItem value="rejected">거부됨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* Groups List */}
      <div className="space-y-4">
        {data.groups.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            해당하는 중복 그룹이 없습니다
          </Card>
        ) : (
          data.groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const statusInfo = STATUS_LABELS[group.reviewStatus] || STATUS_LABELS.auto;

            return (
              <Card key={group.id} className="overflow-hidden">
                {/* Group Header */}
                <div
                  className="p-4 flex items-start justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(group.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{group.normalizedName}</h3>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                      <Badge variant="outline">{group.sourceCount}개 소스</Badge>
                      <Badge variant="outline">
                        신뢰도 {Math.round(group.mergeConfidence * 100)}%
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {group.region} · {group.projectYear || "연도 미상"}
                      {group.canonicalProject && (
                        <> · 대표: {group.canonicalProject.organization}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Quick Actions */}
                    {group.reviewStatus === "pending_review" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(group.id, "updateStatus", {
                              reviewStatus: "confirmed",
                            });
                          }}
                          disabled={actionLoading === `${group.id}-updateStatus`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          확인
                        </Button>
                      </>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t">
                    {/* Status Change */}
                    <div className="p-4 bg-muted/30 flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">상태 변경:</span>
                      <div className="flex gap-2">
                        {Object.entries(STATUS_LABELS).map(([status, info]) => (
                          <Button
                            key={status}
                            variant={group.reviewStatus === status ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              handleAction(group.id, "updateStatus", {
                                reviewStatus: status,
                              })
                            }
                            disabled={actionLoading === `${group.id}-updateStatus`}
                          >
                            {info.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Projects in Group */}
                    <div className="p-4">
                      <h4 className="font-medium mb-3">포함된 프로젝트</h4>
                      <div className="space-y-2">
                        {group.projects.map((project) => (
                          <div
                            key={project.id}
                            className={cn(
                              "p-3 rounded-lg border flex items-start justify-between",
                              project.isCanonical && "bg-primary/5 border-primary/30"
                            )}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                {project.isCanonical && (
                                  <Star className="h-4 w-4 text-primary fill-primary" />
                                )}
                                <span className="font-medium">{project.name}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {project.organization} · {project.region}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                등록: {new Date(project.createdAt).toLocaleDateString("ko-KR")}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {project.sourceUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={project.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              {!project.isCanonical && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleAction(group.id, "changeCanonical", {
                                        newCanonicalId: project.id,
                                      })
                                    }
                                    disabled={
                                      actionLoading === `${group.id}-changeCanonical`
                                    }
                                  >
                                    <Star className="h-4 w-4 mr-1" />
                                    대표 지정
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleAction(group.id, "separate", {
                                        projectId: project.id,
                                      })
                                    }
                                    disabled={actionLoading === `${group.id}-separate`}
                                  >
                                    <Unlink className="h-4 w-4 mr-1" />
                                    분리
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground px-4">
            {page} / {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={page === data.pagination.totalPages}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
