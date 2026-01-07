/**
 * Admin Crawler Management Page
 * Manage crawl sources and jobs with live monitoring
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertCircle, Play, Calendar } from "lucide-react";
import { CrawlerSourceCard } from "@/components/admin/crawler-source-card";
import { AddSourceDialog } from "@/components/admin/add-source-dialog";
import { StartAllCrawlButton } from "@/components/admin/start-all-crawl-button";
import { LiveMonitoringDashboard } from "@/components/admin/live-monitoring-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormattedDate } from "@/components/common/formatted-date";

// 크롤링 소스 캐싱 (30초)
const getCrawlSources = unstable_cache(
  async () => {
    return prisma.crawlSource.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        isActive: true,
        lastCrawled: true,
        schedule: true,
      },
    });
  },
  ["crawler-sources"],
  { revalidate: 30, tags: ["crawler-sources"] }
);

// 최근 크롤링 작업 캐싱 (10초) - 더 자주 변경되는 데이터
const getRecentCrawlJobs = unstable_cache(
  async () => {
    return prisma.crawlJob.findMany({
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
  },
  ["crawler-recent-jobs"],
  { revalidate: 10, tags: ["crawler-jobs"] }
);

export default async function AdminCrawlerPage() {
  // Fetch cached data in parallel
  const [sources, recentJobs] = await Promise.all([
    getCrawlSources(),
    getRecentCrawlJobs(),
  ]);

  // Count active sources
  const activeSourceCount = sources.filter((s) => s.isActive).length;
  const scheduledSourceCount = sources.filter((s) => s.schedule).length;

  // Count running jobs
  const runningJobCount = recentJobs.filter((j) => j.status === "running").length;

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">크롤러 관리</h1>
          <p className="mt-2 text-muted-foreground">
            크롤링 소스와 작업을 관리합니다
          </p>
        </div>
        <StartAllCrawlButton activeSourceCount={activeSourceCount} />
      </div>

      <Tabs defaultValue="monitoring" className="space-y-6">
        <TabsList>
          <TabsTrigger value="monitoring">실시간 모니터링</TabsTrigger>
          <TabsTrigger value="sources">소스 관리</TabsTrigger>
          <TabsTrigger value="history">작업 이력</TabsTrigger>
        </TabsList>

        {/* Live Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-6">
          <LiveMonitoringDashboard />
        </TabsContent>

        {/* Sources Management Tab */}
        <TabsContent value="sources" className="space-y-6">
          {/* Stats Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">전체 소스</div>
              <div className="text-2xl font-bold">{sources.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">활성 소스</div>
              <div className="text-2xl font-bold text-green-600">{activeSourceCount}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                스케줄 설정됨
              </div>
              <div className="text-2xl font-bold text-blue-600">{scheduledSourceCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">실행 중</div>
              <div className="text-2xl font-bold text-orange-600">{runningJobCount}</div>
            </Card>
          </div>

          {/* Crawl Sources */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">크롤링 소스</h2>
              <AddSourceDialog />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sources.map((source) => (
                <CrawlerSourceCard key={source.id} source={source} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Job History Tab */}
        <TabsContent value="history" className="space-y-6">
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
                          <FormattedDate date={job.startedAt} />
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          <FormattedDate date={job.completedAt} />
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
