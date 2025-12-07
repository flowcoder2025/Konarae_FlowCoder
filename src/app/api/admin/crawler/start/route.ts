/**
 * Admin Crawler Start API
 * Start a new crawl job (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";

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

    // TODO: Trigger actual crawl job via Railway service
    // await fetch(`${process.env.RAILWAY_CRAWLER_URL}/crawl`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ jobId: job.id, source })
    // });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
