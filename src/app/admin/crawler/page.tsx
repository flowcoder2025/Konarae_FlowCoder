/**
 * Admin Crawler Management Page
 * Manage crawl sources and jobs
 */

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Database, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

export default async function AdminCrawlerPage() {
  // Fetch crawl sources
  const sources = await prisma.crawlSource.findMany({
    orderBy: { name: "asc" },
  });

  // Fetch recent crawl jobs
  const recentJobs = await prisma.crawlJob.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      source: {
        select: {
          name: true,
        },
      },
    },
  });

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "default",
      running: "secondary",
      completed: "default",
      failed: "destructive",
    } as const;
    return colors[status as keyof typeof colors] || "default";
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      pending: Clock,
      running: Play,
      completed: CheckCircle,
      failed: XCircle,
    };
    return icons[status as keyof typeof icons] || AlertCircle;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">크롤러 관리</h1>
        <p className="mt-2 text-muted-foreground">
          크롤링 소스와 작업을 관리합니다
        </p>
      </div>

      {/* Crawl Sources */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">크롤링 소스</h2>
          <Button>
            <Database className="mr-2 h-4 w-4" />
            소스 추가
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => (
            <Card key={source.id} className="p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{source.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {source.type === "api" ? "API" : "웹"}
                    </p>
                  </div>
                  <Badge variant={source.isActive ? "default" : "outline"}>
                    {source.isActive ? "활성" : "비활성"}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground truncate">
                  {source.url}
                </div>

                {source.lastCrawled && (
                  <div className="text-xs text-muted-foreground">
                    마지막 크롤링: {new Date(source.lastCrawled).toLocaleString("ko-KR")}
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full"
                  disabled={!source.isActive}
                >
                  <Play className="mr-2 h-4 w-4" />
                  크롤링 시작
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Jobs */}
      <div>
        <h2 className="text-xl font-semibold mb-4">최근 작업</h2>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left font-medium">소스</th>
                  <th className="p-4 text-left font-medium">상태</th>
                  <th className="p-4 text-left font-medium">시작 시간</th>
                  <th className="p-4 text-left font-medium">완료 시간</th>
                  <th className="p-4 text-right font-medium">발견/신규/업데이트</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => {
                  const StatusIcon = getStatusIcon(job.status);
                  return (
                    <tr key={job.id} className="border-b last:border-b-0">
                      <td className="p-4">{job.source.name}</td>
                      <td className="p-4">
                        <Badge variant={getStatusColor(job.status)}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {job.status === "pending" && "대기"}
                          {job.status === "running" && "실행 중"}
                          {job.status === "completed" && "완료"}
                          {job.status === "failed" && "실패"}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {job.startedAt ? new Date(job.startedAt).toLocaleString("ko-KR") : "-"}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {job.completedAt ? new Date(job.completedAt).toLocaleString("ko-KR") : "-"}
                      </td>
                      <td className="p-4 text-right text-sm">
                        {job.projectsFound > 0 ? (
                          <span className="text-muted-foreground">
                            {job.projectsFound} / {job.projectsNew} / {job.projectsUpdated}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {recentJobs.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                아직 크롤링 작업이 없습니다
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
