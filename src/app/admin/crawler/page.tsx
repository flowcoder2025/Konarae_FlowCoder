/**
 * Admin Crawler Management Page
 * Manage crawl sources and jobs
 */

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertCircle, Play } from "lucide-react";
import { CrawlerSourceCard } from "@/components/admin/crawler-source-card";
import { AddSourceDialog } from "@/components/admin/add-source-dialog";

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
          <AddSourceDialog />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => (
            <CrawlerSourceCard key={source.id} source={source} />
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
