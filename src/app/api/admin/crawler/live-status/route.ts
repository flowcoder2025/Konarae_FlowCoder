/**
 * Crawler Live Status API
 * GET /api/admin/crawler/live-status
 *
 * Returns real-time crawler status for monitoring dashboard:
 * - Currently running jobs with progress
 * - Recent job history
 * - Source status overview
 * - Error logs
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "admin-crawler-live-status" });

export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RunningJob {
  id: string;
  sourceName: string;
  sourceUrl: string;
  status: string;
  startedAt: string | null;
  duration: number | null;
  projectsFound: number;
  projectsNew: number;
  projectsUpdated: number;
}

interface RecentJob {
  id: string;
  sourceName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  projectsFound: number;
  projectsNew: number;
  projectsUpdated: number;
  errorMessage: string | null;
}

interface SourceOverview {
  id: string;
  name: string;
  url: string;
  type: string;
  isActive: boolean;
  lastCrawled: string | null;
  lastJobStatus: string | null;
  schedule: string | null;
}

interface LiveStatusResponse {
  timestamp: string;
  runningJobs: RunningJob[];
  recentJobs: RecentJob[];
  sources: SourceOverview[];
  summary: {
    totalSources: number;
    activeSources: number;
    runningJobs: number;
    pendingJobs: number;
    completedToday: number;
    failedToday: number;
  };
}

export async function GET(_req: NextRequest) {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all data in parallel
    const [
      runningJobsData,
      pendingJobsCount,
      recentJobsData,
      sourcesData,
      completedTodayCount,
      failedTodayCount,
    ] = await Promise.all([
      // Running jobs with source info
      prisma.crawlJob.findMany({
        where: { status: "running" },
        include: {
          source: {
            select: { name: true, url: true },
          },
        },
        orderBy: { startedAt: "desc" },
      }),

      // Pending jobs count
      prisma.crawlJob.count({ where: { status: "pending" } }),

      // Recent jobs (last 20)
      prisma.crawlJob.findMany({
        take: 20,
        include: {
          source: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      // All sources with last job status
      prisma.crawlSource.findMany({
        select: {
          id: true,
          name: true,
          url: true,
          type: true,
          isActive: true,
          lastCrawled: true,
          schedule: true,
          jobs: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { status: true },
          },
        },
        orderBy: { name: "asc" },
      }),

      // Completed today
      prisma.crawlJob.count({
        where: { status: "completed", completedAt: { gte: today } },
      }),

      // Failed today
      prisma.crawlJob.count({
        where: { status: "failed", completedAt: { gte: today } },
      }),
    ]);

    // Transform running jobs
    const runningJobs: RunningJob[] = runningJobsData.map((job) => ({
      id: job.id,
      sourceName: job.source.name,
      sourceUrl: job.source.url,
      status: job.status,
      startedAt: job.startedAt?.toISOString() || null,
      duration: job.startedAt
        ? Math.round((now.getTime() - job.startedAt.getTime()) / 1000)
        : null,
      projectsFound: job.projectsFound,
      projectsNew: job.projectsNew,
      projectsUpdated: job.projectsUpdated,
    }));

    // Transform recent jobs
    const recentJobs: RecentJob[] = recentJobsData.map((job) => ({
      id: job.id,
      sourceName: job.source.name,
      status: job.status,
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      duration:
        job.startedAt && job.completedAt
          ? Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 1000)
          : null,
      projectsFound: job.projectsFound,
      projectsNew: job.projectsNew,
      projectsUpdated: job.projectsUpdated,
      errorMessage: job.errorMessage,
    }));

    // Transform sources
    const sources: SourceOverview[] = sourcesData.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      type: source.type,
      isActive: source.isActive,
      lastCrawled: source.lastCrawled?.toISOString() || null,
      lastJobStatus: source.jobs[0]?.status || null,
      schedule: source.schedule,
    }));

    const response: LiveStatusResponse = {
      timestamp: now.toISOString(),
      runningJobs,
      recentJobs,
      sources,
      summary: {
        totalSources: sourcesData.length,
        activeSources: sourcesData.filter((s) => s.isActive).length,
        runningJobs: runningJobsData.length,
        pendingJobs: pendingJobsCount,
        completedToday: completedTodayCount,
        failedToday: failedTodayCount,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Crawler live status error", { error });
    return NextResponse.json(
      {
        error: "Failed to fetch crawler status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
