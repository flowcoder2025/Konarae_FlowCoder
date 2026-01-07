"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  History,
} from "lucide-react";

interface PipelineJob {
  id: string;
  type: string;
  status: string;
  targetCount: number;
  successCount: number;
  failCount: number;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  duration: number | null;
}

interface JobsResponse {
  jobs: PipelineJob[];
  total: number;
  limit: number;
  offset: number;
}

const TYPE_LABELS: Record<string, string> = {
  crawl: "크롤링",
  parse: "파싱",
  embed: "임베딩",
};

const TYPE_COLORS: Record<string, string> = {
  crawl: "bg-green-500/10 text-green-600",
  parse: "bg-blue-500/10 text-blue-600",
  embed: "bg-purple-500/10 text-purple-600",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  pending: { icon: Clock, color: "default", label: "대기" },
  running: { icon: Play, color: "secondary", label: "실행 중" },
  completed: { icon: CheckCircle, color: "default", label: "완료" },
  failed: { icon: XCircle, color: "destructive", label: "실패" },
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "수동",
  cron: "Cron",
  api: "API",
};

export function PipelineJobsTable() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 10;

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", limit.toString());
      params.set("offset", (page * limit).toString());

      const response = await fetch(`/api/admin/pipeline/jobs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [typeFilter, statusFilter, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [typeFilter, statusFilter]);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "-";
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}분 ${secs}초`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">작업 이력</h3>
          {data && (
            <Badge variant="outline">{data.total}개</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchJobs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="w-32">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              <SelectItem value="crawl">크롤링</SelectItem>
              <SelectItem value="parse">파싱</SelectItem>
              <SelectItem value="embed">임베딩</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">대기</SelectItem>
              <SelectItem value="running">실행 중</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left text-sm font-medium">유형</th>
                <th className="p-3 text-left text-sm font-medium">상태</th>
                <th className="p-3 text-left text-sm font-medium">트리거</th>
                <th className="p-3 text-right text-sm font-medium">대상</th>
                <th className="p-3 text-right text-sm font-medium">성공/실패</th>
                <th className="p-3 text-left text-sm font-medium">시작</th>
                <th className="p-3 text-left text-sm font-medium">소요시간</th>
              </tr>
            </thead>
            <tbody>
              {data?.jobs.map((job) => {
                const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusConfig.icon;

                return (
                  <tr key={job.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={TYPE_COLORS[job.type]}
                      >
                        {TYPE_LABELS[job.type] || job.type}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={statusConfig.color as "default" | "secondary" | "destructive"}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {TRIGGER_LABELS[job.triggeredBy || ""] || job.triggeredBy || "-"}
                    </td>
                    <td className="p-3 text-right text-sm">
                      {job.targetCount.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-sm">
                      <span className="text-green-600">{job.successCount}</span>
                      {" / "}
                      <span className="text-red-600">{job.failCount}</span>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDate(job.startedAt || job.createdAt)}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDuration(job.duration)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(!data || data.jobs.length === 0) && (
            <div className="p-8 text-center text-muted-foreground">
              {loading ? "로딩 중..." : "작업 이력이 없습니다"}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            {data && (
              <>
                {page * limit + 1} - {Math.min((page + 1) * limit, data.total)} / {data.total}개
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
