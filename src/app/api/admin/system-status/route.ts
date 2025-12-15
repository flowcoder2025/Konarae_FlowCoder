/**
 * System Status API
 * GET /api/admin/system-status
 *
 * Returns comprehensive system health status including:
 * - Database connection
 * - External services (text_parser, QStash, Railway worker)
 * - Recent crawl job statistics
 * - System metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParserServiceInfo } from "@/lib/document-parser";
import { listSchedules, isQStashConfigured } from "@/lib/qstash";

// Vercel Cron schedules defined in vercel.json
// These are static and known at build time
const VERCEL_CRON_SCHEDULES = [
  { path: "/api/cron/crawl-all", schedule: "0 16 * * *", description: "KST 01:00 - 전체 크롤링" },
  { path: "/api/cron/deadline-alerts", schedule: "0 0 * * *", description: "KST 09:00 - 마감일 알림" },
  { path: "/api/cron/matching-refresh", schedule: "0 3 * * *", description: "KST 12:00 - 매칭 갱신" },
  { path: "/api/cron/generate-embeddings", schedule: "0 20 * * *", description: "KST 05:00 - 임베딩 생성" },
];

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

  // If QStash is not configured, return "not configured" status (not an error)
  if (!isQStashConfigured) {
    return {
      status: {
        name: "QStash Scheduler",
        status: "unknown",
        latency: 0,
        message: "Not configured (using Vercel Cron instead)",
        lastChecked: new Date().toISOString(),
      },
      scheduleCount: 0,
    };
  }

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
 * Check Railway Worker status
 */
async function checkRailwayWorker(): Promise<ServiceStatus> {
  const start = Date.now();

  let railwayUrl = process.env.RAILWAY_CRAWLER_URL;
  const workerApiKey = process.env.WORKER_API_KEY;

  // Check if Railway is configured
  if (!railwayUrl || !workerApiKey) {
    return {
      name: "Railway Worker",
      status: "down",
      latency: 0,
      message: !railwayUrl
        ? "RAILWAY_CRAWLER_URL not configured"
        : "WORKER_API_KEY not configured",
      lastChecked: new Date().toISOString(),
    };
  }

  // Ensure URL has protocol
  if (!railwayUrl.startsWith('http://') && !railwayUrl.startsWith('https://')) {
    railwayUrl = `https://${railwayUrl}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(`${railwayUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        name: "Railway Worker",
        status: "healthy",
        latency: Date.now() - start,
        url: railwayUrl,
        message: `Uptime: ${Math.floor(data.uptime || 0)}s`,
        lastChecked: new Date().toISOString(),
      };
    } else {
      return {
        name: "Railway Worker",
        status: "degraded",
        latency: Date.now() - start,
        url: railwayUrl,
        message: `HTTP ${response.status}: ${response.statusText}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Connection failed";
    const isTimeout = errorMessage.includes('abort');

    return {
      name: "Railway Worker",
      status: "down",
      latency: Date.now() - start,
      url: railwayUrl,
      message: isTimeout ? "Connection timeout (10s)" : errorMessage,
      lastChecked: new Date().toISOString(),
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
    const [database, textParser, qstash, railwayWorker, crawlerStats] = await Promise.all([
      checkDatabase(),
      checkTextParser(),
      checkQStash(),
      checkRailwayWorker(),
      getCrawlerStats(),
    ]);

    const services = [textParser, qstash.status, railwayWorker];

    // Determine overall status (ignore "unknown" status for services not configured)
    const allStatuses = [database.status, ...services.map((s) => s.status)];
    const criticalStatuses = allStatuses.filter((s) => s !== "unknown");
    let overallStatus: "healthy" | "degraded" | "down" = "healthy";

    if (criticalStatuses.includes("down")) {
      // Railway worker down is critical for crawling
      overallStatus = database.status === "down" || railwayWorker.status === "down" ? "down" : "degraded";
    } else if (criticalStatuses.includes("degraded")) {
      overallStatus = "degraded";
    }

    // Check if Vercel Cron is configured
    const hasVercelCron = process.env.CRON_SECRET ? true : false;

    // Determine scheduler type and schedule count
    let schedulerType: "vercel-cron" | "qstash" | "none" = "none";
    let scheduleCount = 0;
    let schedulerStatus: "active" | "inactive" | "error" = "inactive";

    if (hasVercelCron) {
      schedulerType = "vercel-cron";
      scheduleCount = VERCEL_CRON_SCHEDULES.length; // Use actual count from vercel.json
      // Vercel Cron is active if CRON_SECRET is set, but we can't verify execution
      schedulerStatus = "active";
    } else if (qstash.scheduleCount > 0) {
      schedulerType = "qstash";
      scheduleCount = qstash.scheduleCount;
      schedulerStatus = qstash.status.status === "healthy" ? "active" : "error";
    }

    // Additional check: if Railway is down, scheduler can't effectively run
    if (railwayWorker.status === "down" && schedulerStatus === "active") {
      schedulerStatus = "error";
    }

    const response: SystemStatusResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      database,
      crawler: crawlerStats,
      scheduler: {
        type: schedulerType,
        schedules: scheduleCount,
        status: schedulerStatus,
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
