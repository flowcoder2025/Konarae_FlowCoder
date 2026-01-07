"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  FileText,
  Brain,
  Paperclip,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface ParseStats {
  total: number;
  parsable: number;
  parsed: number;
  unparsed: number;
  withError: number;
  byFileType: Record<string, number>;
  errorTypes: Record<string, number>;
}

interface EmbedStats {
  total: number;
  embedded: number;
  pending: number;
  embeddingCount: number;
}

interface AttachmentStats {
  totalProjects: number;
  withAttachments: number;
  withoutAttachments: number;
  recrawlable: number;
}

interface PipelineStats {
  timestamp: string;
  parse: ParseStats;
  embed: EmbedStats;
  attachment: AttachmentStats;
}

export function PipelineStatsOverview() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/pipeline/stats");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-4" />
            <div className="h-8 bg-muted rounded w-16" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>통계 로드 실패: {error}</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          다시 시도
        </Button>
      </Card>
    );
  }

  if (!stats) return null;

  const parseProgress = stats.parse.parsable > 0
    ? Math.round((stats.parse.parsed / stats.parse.parsable) * 100)
    : 0;

  const embedProgress = stats.embed.total > 0
    ? Math.round((stats.embed.embedded / stats.embed.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">파이프라인 현황</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Parsing Stats */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">문서 파싱</h3>
            <Badge variant={parseProgress === 100 ? "default" : "secondary"}>
              {parseProgress}%
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">파싱 대상</span>
              <span className="font-medium">{stats.parse.parsable.toLocaleString()}개</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                파싱 완료
              </span>
              <span className="font-medium text-green-600">
                {stats.parse.parsed.toLocaleString()}개
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-500" />
                파싱 실패
              </span>
              <span className="font-medium text-red-600">
                {stats.parse.unparsed.toLocaleString()}개
              </span>
            </div>
            {stats.parse.withError > 0 && (
              <div className="text-xs text-muted-foreground">
                ({stats.parse.withError}개 에러 기록됨)
              </div>
            )}

            {/* Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Embedding Stats */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold">벡터 임베딩</h3>
            <Badge variant={embedProgress === 100 ? "default" : "secondary"}>
              {embedProgress}%
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">전체 프로젝트</span>
              <span className="font-medium">{stats.embed.total.toLocaleString()}개</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                임베딩 완료
              </span>
              <span className="font-medium text-green-600">
                {stats.embed.embedded.toLocaleString()}개
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-orange-500" />
                임베딩 대기
              </span>
              <span className="font-medium text-orange-600">
                {stats.embed.pending.toLocaleString()}개
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              총 임베딩: {stats.embed.embeddingCount.toLocaleString()}개
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${embedProgress}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Attachment Stats */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Paperclip className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">첨부파일 현황</h3>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">전체 프로젝트</span>
              <span className="font-medium">{stats.attachment.totalProjects.toLocaleString()}개</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                첨부파일 있음
              </span>
              <span className="font-medium text-green-600">
                {stats.attachment.withAttachments.toLocaleString()}개
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-500" />
                첨부파일 없음
              </span>
              <span className="font-medium text-red-600">
                {stats.attachment.withoutAttachments.toLocaleString()}개
              </span>
            </div>
            {stats.attachment.recrawlable > 0 && (
              <div className="text-xs text-muted-foreground">
                ({stats.attachment.recrawlable}개 재크롤링 가능)
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Error Types Breakdown */}
      {Object.keys(stats.parse.errorTypes).length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            파싱 에러 유형 분석
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {Object.entries(stats.parse.errorTypes)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div
                  key={type}
                  className="flex justify-between items-center p-2 bg-muted/50 rounded"
                >
                  <span className="text-sm">{type}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* File Type Distribution */}
      {Object.keys(stats.parse.byFileType).length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">파일 유형별 분포</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.parse.byFileType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <Badge key={type} variant="secondary" className="px-3 py-1">
                  {type.toUpperCase()}: {count.toLocaleString()}개
                </Badge>
              ))}
          </div>
        </Card>
      )}

      {/* Last Updated */}
      <div className="text-xs text-muted-foreground text-right">
        마지막 업데이트: {new Date(stats.timestamp).toLocaleString("ko-KR")}
      </div>
    </div>
  );
}
