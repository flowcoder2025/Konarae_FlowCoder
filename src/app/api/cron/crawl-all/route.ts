/**
 * Crawl All Cron Job
 * POST /api/cron/crawl-all - Start crawling for all active sources
 *
 * Triggered by Upstash QStash at 6:00 AM KST (21:00 UTC)
 * QStash Schedule ID: crawl-all-daily
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processCrawlJob } from "@/lib/crawler/worker";
import { verifyQStashSignature } from "@/lib/qstash";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// QStash sends POST requests
export async function POST(req: NextRequest) {
  try {
    // Verify QStash signature
    const signature = req.headers.get("upstash-signature");
    const body = await req.text();

    const isValid = await verifyQStashSignature(signature, body);
    if (!isValid) {
      console.error("[Cron] Invalid QStash signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Crawl all started at", new Date().toISOString());

    // Get all active sources
    const activeSources = await prisma.crawlSource.findMany({
      where: { isActive: true },
    });

    if (activeSources.length === 0) {
      console.log("[Cron] No active sources found");
      return NextResponse.json({
        success: true,
        message: "No active sources",
        jobsCreated: 0,
      });
    }

    console.log(`[Cron] Found ${activeSources.length} active source(s)`);

    // Create jobs for all active sources
    const jobs = await Promise.all(
      activeSources.map(async (source) => {
        const job = await prisma.crawlJob.create({
          data: {
            sourceId: source.id,
            status: "pending",
          },
        });

        // Update source lastCrawled
        await prisma.crawlSource.update({
          where: { id: source.id },
          data: { lastCrawled: new Date() },
        });

        return { jobId: job.id, sourceName: source.name };
      })
    );

    console.log(`[Cron] Created ${jobs.length} crawl job(s)`);

    // Process jobs (fire and forget - cron has time limit)
    // For longer processing, consider using a queue service
    for (const job of jobs) {
      processCrawlJob(job.jobId).catch((error) => {
        console.error(`[Cron] Job ${job.jobId} (${job.sourceName}) failed:`, error);
      });
    }

    return NextResponse.json({
      success: true,
      message: `Started ${jobs.length} crawl job(s)`,
      jobsCreated: jobs.length,
      sources: jobs.map((j) => j.sourceName),
    });
  } catch (error) {
    console.error("[Cron] Crawl all error:", error);
    return NextResponse.json(
      { error: "Failed to start crawl jobs" },
      { status: 500 }
    );
  }
}
