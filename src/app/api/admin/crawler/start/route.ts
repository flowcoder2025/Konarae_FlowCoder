/**
 * Admin Crawler Start API
 * Start a new crawl job (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";
import { triggerCrawl } from "@/lib/railway";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "admin-crawler-start" });

const crawlStartSchema = z.object({
  sourceId: z.string().cuid(),
});

/**
 * POST /api/admin/crawler/start
 * Start a new crawl job
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { sourceId } = crawlStartSchema.parse(body);

    // Check if source exists
    const source = await prisma.crawlSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return NextResponse.json(
        { error: "크롤 소스를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (!source.isActive) {
      return NextResponse.json(
        { error: "비활성화된 크롤 소스입니다" },
        { status: 400 }
      );
    }

    // Create crawl job
    const job = await prisma.crawlJob.create({
      data: {
        sourceId,
        status: "pending",
      },
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
    });

    // Trigger actual crawl job via Railway service
    const crawlResult = await triggerCrawl(sourceId);

    if (crawlResult.success) {
      // Update job status to running
      await prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: "running" },
      });

      logger.info("Crawl job triggered", {
        jobId: job.id,
        sourceId,
        sourceName: source.name,
      });
    } else {
      // Update job status to failed if trigger failed
      await prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorMessage: crawlResult.error,
        },
      });

      logger.error("Crawl trigger failed", {
        jobId: job.id,
        sourceId,
        error: crawlResult.error,
      });

      return NextResponse.json(
        {
          job,
          warning: "Job created but trigger failed",
          error: crawlResult.error,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ job, crawlResult }, { status: 201 });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
