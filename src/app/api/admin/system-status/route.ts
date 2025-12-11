/**
 * System Status API
 * GET /api/admin/system-status
 *
 * Returns comprehensive system health status including:
 * - Database connection
 * - External services (text_parser, QStash)
 * - Recent crawl job statistics
 * - System metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParserServiceInfo } from "@/lib/document-parser";
import { listSchedules } from "@/lib/qstash";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency?: number;
  message?: string;
  url?: string;
  lastChecked: string;
}

interface CrawlStats {
  totalJobs: number;
  runningJobs: number;
  completedToday: number;
  failedToday: number;
  pendingJobs: number;
  lastSuccessfulCrawl?: string;
  avgDuration?: number;
}

interface SystemStatusResponse {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  services: ServiceStatus[];
  database: ServiceStatus;
  crawler: CrawlStats;
  scheduler: {
    type: "vercel-cron" | "qstash" | "none";
    schedules: number;
    status: "active" | "inactive" | "error";
  };
}

/**
 * Check database connection
 */
async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: "PostgreSQL (Supabase)",
      status: "healthy",
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: "PostgreSQL (Supabase)",
      status: "down",
      message: error instanceof Error ? error.message : "Connection failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check text_parser service
 */
async function checkTextParser(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const info = await getParserServiceInfo();
    return {
      name: "Text Parser (Render)",
      status: info.available ? "healthy" : "down",
      latency: Date.now() - start,
      url: info.url,
      message: info.version ? `v${info.version}` : undefined,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: "Text Parser (Render)",
      status: "down",
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check QStash scheduler status
 */
async function checkQStash(): Promise<{ status: ServiceStatus; scheduleCount: number }> {
  const start = Date.now();
  try {
    const result = await listSchedules();
    if (result.success && result.schedules) {
      return {
        status: {
          name: "QStash Scheduler",
          status: "healthy",
          latency: Date.now() - start,
          message: `${result.schedules.length} schedule(s) active`,
          lastChecked: new Date().toISOString(),
        },
        scheduleCount: result.schedules.length,
      };
    }
    return {
      status: {
        name: "QStash Scheduler",
        status: "degraded",
        latency: Date.now() - start,
        message: "Unable to fetch schedules",
        lastChecked: new Date().toISOString(),
      },
      scheduleCount: 0,
    };
  } catch (error) {
    return {
      status: {
        name: "QStash Scheduler",
        status: "down",
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : "Connection failed",
        lastChecked: new Date().toISOString(),
      },
      scheduleCount: 0,
    };
  }
}

/**
 * Get crawler statistics
 */
async function getCrawlerStats(): Promise<CrawlStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalJobs,
    runningJobs,
    completedToday,
    failedToday,
    pendingJobs,
    lastSuccessful,
  ] = await Promise.all([
    prisma.crawlJob.count(),
    prisma.crawlJob.count({ where: { status: "running" } }),
    prisma.crawlJob.count({
      where: { status: "completed", completedAt: { gte: today } },
    }),
    prisma.crawlJob.count({
      where: { status: "failed", completedAt: { gte: today } },
    }),
    prisma.crawlJob.count({ where: { status: "pending" } }),
    prisma.crawlJob.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);

  // Calculate average duration for completed jobs today
  const completedJobsWithDuration = await prisma.crawlJob.findMany({
    where: {
      status: "completed",
      completedAt: { gte: today },
      startedAt: { not: null },
    },
    select: { startedAt: true, completedAt: true },
  });

  let avgDuration: number | undefined;
  if (completedJobsWithDuration.length > 0) {
    const totalDuration = completedJobsWithDuration.reduce((sum, job) => {
      if (job.startedAt && job.completedAt) {
        return sum + (job.completedAt.getTime() - job.startedAt.getTime());
      }
      return sum;
    }, 0);
    avgDuration = Math.round(totalDuration / completedJobsWithDuration.length / 1000);
  }

  return {
    totalJobs,
    runningJobs,
    completedToday,
    failedToday,
    pendingJobs,
    lastSuccessfulCrawl: lastSuccessful?.completedAt?.toISOString(),
    avgDuration,
  };
}

export async function GET(_req: NextRequest) {
  try {
    // Run all checks in parallel
    const [database, textParser, qstash, crawlerStats] = await Promise.all([
      checkDatabase(),
      checkTextParser(),
      checkQStash(),
      getCrawlerStats(),
    ]);

    const services = [textParser, qstash.status];

    // Determine overall status
    const allStatuses = [database.status, ...services.map((s) => s.status)];
    let overallStatus: "healthy" | "degraded" | "down" = "healthy";

    if (allStatuses.includes("down")) {
      overallStatus = database.status === "down" ? "down" : "degraded";
    } else if (allStatuses.includes("degraded")) {
      overallStatus = "degraded";
    }

    // Check if Vercel Cron is configured
    const hasVercelCron = process.env.CRON_SECRET ? true : false;

    const response: SystemStatusResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      database,
      crawler: crawlerStats,
      scheduler: {
        type: hasVercelCron ? "vercel-cron" : qstash.scheduleCount > 0 ? "qstash" : "none",
        schedules: qstash.scheduleCount,
        status: hasVercelCron || qstash.scheduleCount > 0 ? "active" : "inactive",
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[SystemStatus] Error:", error);
    return NextResponse.json(
      {
        status: "down",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
