/**
 * Close Expired Projects Cron Job
 * GET/POST /api/cron/close-expired
 *
 * Automatically closes projects whose deadline has passed.
 * Runs BEFORE the matching pipeline to ensure clean data.
 *
 * Schedule: Daily at 23:00 KST (14:00 UTC)
 * Pipeline order: close-expired(23:00) → crawl(00:00) → analyze(02:00) → embed(05:00) → match(06:00) → digest(09:00)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-close-expired" });

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Verify request authorization
 */
function verifyAuthorization(req: NextRequest): { valid: boolean; source: string } {
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { valid: true, source: "vercel-cron" };
  }

  const apiKey = req.headers.get("x-api-key");
  if (apiKey === process.env.ADMIN_API_KEY) {
    return { valid: true, source: "admin" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Close expired projects and clean up related matching results
 */
async function executeCloseExpired(source: string): Promise<NextResponse> {
  try {
    const now = new Date();
    logger.info(`Close expired started via ${source}`);

    // 1. Find expired project IDs first (for scoped cleanup)
    const expiredProjects = await prisma.supportProject.findMany({
      where: {
        status: "active",
        isPermanent: false,
        deadline: { lt: now },
        deletedAt: null,
      },
      select: { id: true },
    });

    const expiredIds = expiredProjects.map((p) => p.id);

    if (expiredIds.length > 0) {
      // 2. Close expired projects
      await prisma.supportProject.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: "closed" },
      });
    }

    logger.info(`Closed ${expiredIds.length} expired projects`);

    // 3. Clean up matching results for these newly closed projects
    // First: detach UserProject references to avoid FK violation
    if (expiredIds.length > 0) {
      await prisma.userProject.updateMany({
        where: {
          matchingResult: {
            projectId: { in: expiredIds },
          },
        },
        data: { matchingResultId: null },
      });

      // Then: delete the stale matching results
      const deletedResults = await prisma.matchingResult.deleteMany({
        where: { projectId: { in: expiredIds } },
      });

      logger.info(`Cleaned up ${deletedResults.count} stale matching results`);
    }

    return NextResponse.json({
      success: true,
      projectsClosed: expiredIds.length,
      triggeredBy: source,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Close expired error", { error });
    return NextResponse.json(
      {
        error: "Failed to close expired projects",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeCloseExpired(source);
}

export async function POST(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeCloseExpired(source);
}
