"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StatsData {
  summary: {
    totalJobs: number;
    totalProjectsFound: number;
    totalProjectsNew: number;
    totalProjectsUpdated: number;
    successRate: number;
    period: string;
  };
  dailyStats: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
    projectsFound: number;
    projectsNew: number;
    successRate: number;
  }>;
  recentFailures: Array<{
    id: string;
    source: string;
    error: string;
    createdAt: string;
  }>;
  sourceStats: Array<{
    sourceId: string;
    sourceName: string;
    jobCount: number;
    projectsNew: number;
  }>;
}

export function CrawlerStatsDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/crawler/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
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
          <span>통계를 불러오는데 실패했습니다: {error}</span>
        </div>
        <Button onClick={fetchStats} variant="outline" className="mt-4">
          다시 시도
        </Button>
      </Card>
    );
  }

  if (!stats) return null;

  const maxProjectsNew = Math.max(...stats.dailyStats.map((d) => d.projectsNew), 1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            총 작업 수
          </div>
          <div className="text-2xl font-bold mt-1">{stats.summary.totalJobs}</div>
          <div className="text-xs text-muted-foreground">최근 {stats.summary.period}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            발견 프로젝트
          </div>
          <div className="text-2xl font-bold mt-1">{stats.summary.totalProjectsFound}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-green-600" />
            신규 프로젝트
          </div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {stats.summary.totalProjectsNew}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            업데이트
          </div>
          <div className="text-2xl font-bold mt-1 text-blue-600">
            {stats.summary.totalProjectsUpdated}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4" />
            성공률
          </div>
          <div
            className={cn(
              "text-2xl font-bold mt-1",
              stats.summary.successRate >= 90
                ? "text-green-600"
                : stats.summary.successRate >= 70
                ? "text-yellow-600"
                : "text-red-600"
            )}
          >
            {stats.summary.successRate}%
          </div>
        </Card>
      </div>

      {/* Daily Stats Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">일별 수집 현황</h3>
          <Button variant="ghost" size="sm" onClick={fetchStats}>
            <RefreshCw className="h-4 w-4 mr-1" />
            새로고침
          </Button>
        </div>

        <div className="space-y-3">
          {stats.dailyStats.slice(0, 7).map((day) => (
            <div key={day.date} className="flex items-center gap-4">
              <div className="w-24 text-sm text-muted-foreground shrink-0">
                {new Date(day.date).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </div>

              {/* Bar chart */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${(day.projectsNew / maxProjectsNew) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-sm font-medium text-right">
                  +{day.projectsNew}
                </span>
              </div>

              {/* Success rate badge */}
              <Badge
                variant={
                  day.successRate >= 90
                    ? "default"
                    : day.successRate >= 70
                    ? "outline"
                    : "destructive"
                }
                className="w-16 justify-center"
              >
                {day.successRate}%
              </Badge>

              {/* Job counts */}
              <div className="w-20 text-xs text-muted-foreground text-right">
                <span className="text-green-600">{day.completed}</span>
                {day.failed > 0 && (
                  <>
                    {" / "}
                    <span className="text-red-600">{day.failed}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Source Stats */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">소스별 통계</h3>
          <div className="space-y-3">
            {stats.sourceStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            ) : (
              stats.sourceStats.map((source) => (
                <div
                  key={source.sourceId}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{source.sourceName}</div>
                    <div className="text-xs text-muted-foreground">
                      {source.jobCount}회 실행
                    </div>
                  </div>
                  <Badge variant="outline">+{source.projectsNew} 신규</Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Failures */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            최근 실패
          </h3>
          <div className="space-y-3">
            {stats.recentFailures.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                최근 7일간 실패 없음
              </div>
            ) : (
              stats.recentFailures.slice(0, 5).map((failure) => (
                <div
                  key={failure.id}
                  className="py-2 border-b last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{failure.source}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(failure.createdAt).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-destructive mt-1 truncate">
                    {failure.error}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
