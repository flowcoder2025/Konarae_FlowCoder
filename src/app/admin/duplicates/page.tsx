/**
 * Admin Duplicate Management Page
 * Manage and review duplicate project groups
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDateKST } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Trash2,
  Eye,
  Star,
  RefreshCw,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  organization: string;
  deadline: string | null;
  status: string;
  isCanonical: boolean;
  createdAt: string;
}

interface DuplicateGroup {
  id: string;
  normalizedName: string;
  projectYear: number | null;
  canonicalProjectId: string;
  mergeConfidence: number;
  reviewStatus: string;
  sourceCount: number;
  createdAt: string;
  canonicalProject: Project;
  projects: Project[];
}

interface GroupStats {
  pending_review?: number;
  auto?: number;
  confirmed?: number;
  rejected?: number;
}

export default function AdminDuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [stats, setStats] = useState<GroupStats>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending_review");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Detail modal state
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Dissolve confirmation
  const [dissolveGroup, setDissolveGroup] = useState<DuplicateGroup | null>(
    null
  );

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-groups?status=${status}&page=${page}&pageSize=20`
      );
      const data = await res.json();
      setGroups(data.groups);
      setStats(data.stats);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleUpdateGroup = async (
    groupId: string,
    updates: { reviewStatus?: string; canonicalProjectId?: string }
  ) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/duplicate-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const updated = await res.json();
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? updated : g))
        );
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(updated);
        }
        // Refresh if status filter doesn't match
        if (updates.reviewStatus && updates.reviewStatus !== status) {
          fetchGroups();
        }
      }
    } catch (error) {
      console.error("Failed to update group:", error);
    } finally {
      setUpdating(false);
    }
  };

  const handleDissolveGroup = async () => {
    if (!dissolveGroup) return;

    setUpdating(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-groups/${dissolveGroup.id}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== dissolveGroup.id));
        setDissolveGroup(null);
        setDetailOpen(false);
        fetchGroups();
      }
    } catch (error) {
      console.error("Failed to dissolve group:", error);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (reviewStatus: string) => {
    switch (reviewStatus) {
      case "pending_review":
        return <Badge variant="outline">검토 필요</Badge>;
      case "auto":
        return <Badge variant="secondary">자동 병합</Badge>;
      case "confirmed":
        return <Badge variant="default">확인됨</Badge>;
      case "rejected":
        return (
          <Badge variant="outline" className="border-destructive text-destructive">
            거부됨
          </Badge>
        );
      default:
        return <Badge variant="outline">{reviewStatus}</Badge>;
    }
  };

  const openDetail = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">중복 관리</h1>
        <p className="mt-2 text-muted-foreground">
          중복 프로젝트 그룹을 검토하고 관리합니다
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card
          className={`cursor-pointer p-4 transition-colors ${
            status === "pending_review" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleStatusChange("pending_review")}
        >
          <div className="text-sm text-muted-foreground">검토 필요</div>
          <div className="text-2xl font-bold text-orange-500">
            {stats.pending_review || 0}
          </div>
        </Card>
        <Card
          className={`cursor-pointer p-4 transition-colors ${
            status === "auto" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleStatusChange("auto")}
        >
          <div className="text-sm text-muted-foreground">자동 병합</div>
          <div className="text-2xl font-bold">{stats.auto || 0}</div>
        </Card>
        <Card
          className={`cursor-pointer p-4 transition-colors ${
            status === "confirmed" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleStatusChange("confirmed")}
        >
          <div className="text-sm text-muted-foreground">확인됨</div>
          <div className="text-2xl font-bold text-green-500">
            {stats.confirmed || 0}
          </div>
        </Card>
        <Card
          className={`cursor-pointer p-4 transition-colors ${
            status === "rejected" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleStatusChange("rejected")}
        >
          <div className="text-sm text-muted-foreground">거부됨</div>
          <div className="text-2xl font-bold text-red-500">
            {stats.rejected || 0}
          </div>
        </Card>
        <Card
          className={`cursor-pointer p-4 transition-colors ${
            status === "all" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleStatusChange("all")}
        >
          <div className="text-sm text-muted-foreground">전체</div>
          <div className="text-2xl font-bold">
            {Object.values(stats).reduce((a, b) => (a || 0) + (b || 0), 0)}
          </div>
        </Card>
      </div>

      {/* Groups List */}
      <Card>
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm text-muted-foreground">
            총 {total}개 그룹
          </div>
          <Button variant="outline" size="sm" onClick={fetchGroups}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            로딩 중...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left font-medium">정규화 이름</th>
                  <th className="p-4 text-left font-medium">연도</th>
                  <th className="p-4 text-left font-medium">대표 프로젝트</th>
                  <th className="p-4 text-center font-medium">중복 수</th>
                  <th className="p-4 text-center font-medium">신뢰도</th>
                  <th className="p-4 text-left font-medium">상태</th>
                  <th className="p-4 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr
                    key={group.id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="max-w-xs truncate p-4 font-medium">
                      {group.normalizedName}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {group.projectYear || "-"}
                    </td>
                    <td className="max-w-xs truncate p-4 text-sm">
                      {group.canonicalProject?.name}
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant="secondary">{group.sourceCount}</Badge>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`text-sm font-medium ${
                          group.mergeConfidence >= 0.85
                            ? "text-green-500"
                            : group.mergeConfidence >= 0.7
                              ? "text-orange-500"
                              : "text-red-500"
                        }`}
                      >
                        {Math.round(group.mergeConfidence * 100)}%
                      </span>
                    </td>
                    <td className="p-4">{getStatusBadge(group.reviewStatus)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetail(group)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {group.reviewStatus === "pending_review" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleUpdateGroup(group.id, {
                                  reviewStatus: "confirmed",
                                })
                              }
                              disabled={updating}
                            >
                              <Check className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleUpdateGroup(group.id, {
                                  reviewStatus: "rejected",
                                })
                              }
                              disabled={updating}
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {groups.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                해당 상태의 그룹이 없습니다
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-4">
            <div className="text-sm text-muted-foreground">
              페이지 {page} / {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>그룹 상세</DialogTitle>
            <DialogDescription>
              중복 프로젝트 그룹을 검토하고 대표 프로젝트를 선택합니다
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4">
              {/* Group Info */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
                <div>
                  <div className="text-sm text-muted-foreground">정규화 이름</div>
                  <div className="font-medium">{selectedGroup.normalizedName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">연도</div>
                  <div className="font-medium">
                    {selectedGroup.projectYear || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">유사도</div>
                  <div className="font-medium">
                    {Math.round(selectedGroup.mergeConfidence * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">상태</div>
                  <div>{getStatusBadge(selectedGroup.reviewStatus)}</div>
                </div>
              </div>

              {/* Projects List */}
              <div>
                <div className="mb-2 text-sm font-medium">
                  포함된 프로젝트 ({selectedGroup.projects.length}개)
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {selectedGroup.projects.map((project) => (
                    <div
                      key={project.id}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        project.isCanonical
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {project.name}
                          </span>
                          {project.isCanonical && (
                            <Badge variant="default" className="shrink-0">
                              <Star className="mr-1 h-3 w-3" />
                              대표
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {project.organization} ·{" "}
                          {project.deadline
                            ? formatDateKST(project.deadline)
                            : "상시"}
                        </div>
                      </div>
                      {!project.isCanonical && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdateGroup(selectedGroup.id, {
                              canonicalProjectId: project.id,
                            })
                          }
                          disabled={updating}
                        >
                          대표로 설정
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Change */}
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">상태 변경:</div>
                <Select
                  value={selectedGroup.reviewStatus}
                  onValueChange={(value) =>
                    handleUpdateGroup(selectedGroup.id, { reviewStatus: value })
                  }
                  disabled={updating}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_review">검토 필요</SelectItem>
                    <SelectItem value="auto">자동 병합</SelectItem>
                    <SelectItem value="confirmed">확인됨</SelectItem>
                    <SelectItem value="rejected">거부됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDissolveGroup(selectedGroup)}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              그룹 해제
            </Button>
            <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dissolve Confirmation */}
      <Dialog
        open={!!dissolveGroup}
        onOpenChange={() => setDissolveGroup(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 해제 확인</DialogTitle>
            <DialogDescription>
              이 그룹을 해제하면 {dissolveGroup?.sourceCount}개의 프로젝트가 개별
              프로젝트로 분리됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDissolveGroup(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDissolveGroup}
              disabled={updating}
            >
              해제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
