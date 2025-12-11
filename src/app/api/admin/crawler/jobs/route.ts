/**
 * Admin Crawler Jobs API
 * List all crawl jobs (admin only)
 *
 * GET /api/admin/crawler/jobs - List jobs
 * DELETE /api/admin/crawler/jobs - Cancel stuck jobs
 * POST /api/admin/crawler/jobs - Cleanup old stuck jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/crawler/jobs
 * List all crawl jobs
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status");

    const where = status ? { status } : {};

    const [jobs, total] = await Promise.all([
      prisma.crawlJob.findMany({
        where,
        include: {
          source: {
            select: {
              id: true,
              name: true,
              url: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.crawlJob.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}

/**
 * DELETE /api/admin/crawler/jobs
 * Cancel specific job or all stuck jobs
 * Query params:
 *   - jobId: Cancel specific job
 *   - all: Cancel all running jobs
 *   - stuckMinutes: Cancel jobs running longer than X minutes (default: 60)
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const cancelAll = searchParams.get("all") === "true";
    const stuckMinutes = parseInt(searchParams.get("stuckMinutes") || "60", 10);

    let cancelledCount = 0;
    const now = new Date();

    if (jobId) {
      // Cancel specific job
      const result = await prisma.crawlJob.updateMany({
        where: {
          id: jobId,
          status: "running",
        },
        data: {
          status: "failed",
          completedAt: now,
          errorMessage: "Manually cancelled by admin",
        },
      });
      cancelledCount = result.count;
    } else if (cancelAll) {
      // Cancel ALL running jobs
      const result = await prisma.crawlJob.updateMany({
        where: {
          status: "running",
        },
        data: {
          status: "failed",
          completedAt: now,
          errorMessage: "Manually cancelled by admin (bulk cancel)",
        },
      });
      cancelledCount = result.count;
    } else {
      // Cancel jobs stuck longer than stuckMinutes
      const cutoffTime = new Date(now.getTime() - stuckMinutes * 60 * 1000);

      const result = await prisma.crawlJob.updateMany({
        where: {
          status: "running",
          startedAt: {
            lt: cutoffTime,
          },
        },
        data: {
          status: "failed",
          completedAt: now,
          errorMessage: `Auto-cancelled: stuck for more than ${stuckMinutes} minutes`,
        },
      });
      cancelledCount = result.count;
    }

    return NextResponse.json({
      success: true,
      cancelledCount,
      message: `Successfully cancelled ${cancelledCount} job(s)`,
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}

/**
 * POST /api/admin/crawler/jobs
 * Cleanup old stuck jobs and reset source status
 * Body:
 *   - action: "cleanup" for cleanup operation
 *   - stuckMinutes: Mark jobs as failed if running longer than X minutes
 *   - resetPending: Also cancel pending jobs older than X minutes
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action !== "cleanup") {
      return NextResponse.json(
        { error: "Invalid action. Use 'cleanup'" },
        { status: 400 }
      );
    }

    const stuckMinutes = body.stuckMinutes || 60;
    const resetPending = body.resetPending || false;

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - stuckMinutes * 60 * 1000);

    // Cancel stuck running jobs
    const runningResult = await prisma.crawlJob.updateMany({
      where: {
        status: "running",
        startedAt: {
          lt: cutoffTime,
        },
      },
      data: {
        status: "failed",
        completedAt: now,
        errorMessage: `Cleanup: stuck for more than ${stuckMinutes} minutes`,
      },
    });

    let pendingCancelled = 0;
    if (resetPending) {
      // Also cancel old pending jobs
      const pendingResult = await prisma.crawlJob.updateMany({
        where: {
          status: "pending",
          createdAt: {
            lt: cutoffTime,
          },
        },
        data: {
          status: "failed",
          completedAt: now,
          errorMessage: `Cleanup: pending for more than ${stuckMinutes} minutes`,
        },
      });
      pendingCancelled = pendingResult.count;
    }

    return NextResponse.json({
      success: true,
      stuckJobsCancelled: runningResult.count,
      pendingJobsCancelled: pendingCancelled,
      totalCancelled: runningResult.count + pendingCancelled,
      message: `Cleanup completed: ${runningResult.count} stuck + ${pendingCancelled} pending jobs cancelled`,
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
