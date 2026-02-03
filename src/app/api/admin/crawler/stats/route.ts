/**
 * Admin Crawler Stats API
 * GET /api/admin/crawler/stats - Get crawler statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/crawler/stats
 * Get crawler statistics for the admin dashboard
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 최근 7일 일별 통계
    const dailyStats = await prisma.$queryRaw<
      Array<{
        date: Date;
        total: bigint;
        completed: bigint;
        failed: bigint;
        projects_found: bigint;
        projects_new: bigint;
      }>
    >`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM("projectsFound"), 0) as projects_found,
        COALESCE(SUM("projectsNew"), 0) as projects_new
      FROM "CrawlJob"
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')
      ORDER BY date DESC
    `;

    // 전체 통계
    const [totalStats, recentJobs, sourceStats] = await Promise.all([
      // 전체 job 통계
      prisma.crawlJob.aggregate({
        _count: true,
        _sum: {
          projectsFound: true,
          projectsNew: true,
          projectsUpdated: true,
        },
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),

      // 최근 실패한 job
      prisma.crawlJob.findMany({
        where: {
          status: "failed",
          createdAt: { gte: sevenDaysAgo },
        },
        select: {
          id: true,
          errorMessage: true,
          createdAt: true,
          source: {
            select: { name: true, url: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // 소스별 통계
      prisma.crawlJob.groupBy({
        by: ["sourceId"],
        _count: true,
        _sum: {
          projectsNew: true,
        },
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: "completed",
        },
      }),
    ]);

    // 소스 이름 조회
    const sourceIds = sourceStats.map((s) => s.sourceId);
    const sources = await prisma.crawlSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, name: true },
    });
    const sourceNameMap = new Map(sources.map((s) => [s.id, s.name]));

    // 7일 성공률 계산
    const completedCount = dailyStats.reduce(
      (sum, d) => sum + Number(d.completed),
      0
    );
    const totalCount = dailyStats.reduce(
      (sum, d) => sum + Number(d.total),
      0
    );
    const successRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalJobs: totalStats._count,
        totalProjectsFound: totalStats._sum.projectsFound || 0,
        totalProjectsNew: totalStats._sum.projectsNew || 0,
        totalProjectsUpdated: totalStats._sum.projectsUpdated || 0,
        successRate: Math.round(successRate * 10) / 10,
        period: "7일",
      },
      dailyStats: dailyStats.map((d) => ({
        date: d.date.toISOString().split("T")[0],
        total: Number(d.total),
        completed: Number(d.completed),
        failed: Number(d.failed),
        projectsFound: Number(d.projects_found),
        projectsNew: Number(d.projects_new),
        successRate:
          Number(d.total) > 0
            ? Math.round((Number(d.completed) / Number(d.total)) * 1000) / 10
            : 0,
      })),
      recentFailures: recentJobs.map((job) => ({
        id: job.id,
        source: job.source.name,
        error: job.errorMessage || "Unknown error",
        createdAt: job.createdAt.toISOString(),
      })),
      sourceStats: sourceStats.map((s) => ({
        sourceId: s.sourceId,
        sourceName: sourceNameMap.get(s.sourceId) || "Unknown",
        jobCount: s._count,
        projectsNew: s._sum.projectsNew || 0,
      })),
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
