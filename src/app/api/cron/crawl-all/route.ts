/**
 * Crawl All Cron Job
 * GET/POST /api/cron/crawl-all - Start crawling for all active sources
 *
 * Supports:
 * - Vercel Cron (GET with CRON_SECRET) - KST 01:00 = UTC 16:00 (previous day)
 * - Upstash QStash (POST with signature)
 * - Manual trigger (with ADMIN_API_KEY)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyQStashSignature } from "@/lib/qstash";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Verify request authorization
 * Supports: Vercel Cron, QStash, or manual admin trigger
 */
async function verifyAuthorization(req: NextRequest): Promise<{ valid: boolean; source: string }> {
  // 1. Check Vercel Cron secret (GET requests)
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { valid: true, source: "vercel-cron" };
  }

  // 2. Check QStash signature (POST requests)
  const qstashSignature = req.headers.get("upstash-signature");
  if (qstashSignature) {
    const body = await req.clone().text();
    const isValid = await verifyQStashSignature(qstashSignature, body);
    if (isValid) {
      return { valid: true, source: "qstash" };
    }
  }

  // 3. Check for manual admin trigger (with API key)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey === process.env.ADMIN_API_KEY) {
    return { valid: true, source: "admin" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Execute the crawl all operation
 */
async function executeCrawlAll(source: string): Promise<NextResponse> {
  try {
    console.log(`[Cron] Crawl all started via ${source} at`, new Date().toISOString());

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
        triggeredBy: source,
      });
    }

    console.log(`[Cron] Found ${activeSources.length} active source(s)`);

    // Create jobs for all active sources
    const jobs = await Promise.all(
      activeSources.map(async (crawlSource) => {
        const job = await prisma.crawlJob.create({
          data: {
            sourceId: crawlSource.id,
            status: "pending",
          },
        });

        // Update source lastCrawled
        await prisma.crawlSource.update({
          where: { id: crawlSource.id },
          data: { lastCrawled: new Date() },
        });

        return { jobId: job.id, sourceName: crawlSource.name };
      })
    );

    console.log(`[Cron] Created ${jobs.length} crawl job(s)`);

    // Delegate jobs to Railway worker
    // Railway has no time limit, can process all jobs in background
    let RAILWAY_URL = process.env.RAILWAY_CRAWLER_URL;
    const WORKER_API_KEY = process.env.WORKER_API_KEY;

    if (!RAILWAY_URL || !WORKER_API_KEY) {
      console.error("[Cron] Railway configuration missing (RAILWAY_CRAWLER_URL or WORKER_API_KEY)");
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "Railway worker not configured",
        },
        { status: 500 }
      );
    }

    // Ensure RAILWAY_URL has https:// protocol
    if (!RAILWAY_URL.startsWith('http://') && !RAILWAY_URL.startsWith('https://')) {
      RAILWAY_URL = `https://${RAILWAY_URL}`;
      console.log(`[Cron] Added https:// protocol to RAILWAY_URL: ${RAILWAY_URL}`);
    }

    // Send jobs to Railway worker
    let successCount = 0;
    let failCount = 0;

    for (const job of jobs) {
      try {
        const response = await fetch(`${RAILWAY_URL}/crawl`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WORKER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: job.jobId }),
        });

        if (response.ok) {
          console.log(`[Cron] Job ${job.jobId} (${job.sourceName}) queued to Railway worker`);
          successCount++;
        } else {
          console.error(`[Cron] Failed to queue job ${job.jobId}: ${response.status} ${response.statusText}`);
          failCount++;
        }
      } catch (error) {
        console.error(`[Cron] Error sending job ${job.jobId} to Railway:`, error);
        failCount++;
      }
    }

    console.log(`[Cron] Railway delegation complete: ${successCount} queued, ${failCount} failed`);

    return NextResponse.json({
      success: true,
      message: `Started ${jobs.length} crawl job(s)`,
      jobsCreated: jobs.length,
      sources: jobs.map((j) => j.sourceName),
      triggeredBy: source,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Crawl all error:", error);
    return NextResponse.json(
      {
        error: "Failed to start crawl jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Vercel Cron sends GET requests
export async function GET(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    console.error("[Cron] Unauthorized GET request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeCrawlAll(source);
}

// QStash sends POST requests
export async function POST(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    console.error("[Cron] Unauthorized POST request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeCrawlAll(source);
}
