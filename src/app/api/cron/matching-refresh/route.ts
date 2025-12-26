/**
 * Matching Refresh Cron Job (PRD Phase 8)
 * GET/POST /api/cron/matching-refresh - Refresh matching results for active companies
 *
 * This endpoint can either:
 * 1. Delegate to Railway worker for large-scale processing (recommended)
 * 2. Process directly in Vercel (for smaller batches or testing)
 *
 * Schedule: Daily at 06:00 KST (21:00 UTC previous day)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { executeMatching, storeMatchingResults } from "@/lib/matching";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-matching-refresh" });

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Verify request authorization (multi-source support)
 */
async function verifyAuthorization(
  req: NextRequest
): Promise<{ valid: boolean; source: string }> {
  // 1. Check Vercel Cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { valid: true, source: "vercel-cron" };
  }

  // 2. Check QStash signature
  const qstashSignature = req.headers.get("upstash-signature");
  if (qstashSignature) {
    const body = await req.clone().text();
    const isValid = await verifyQStashSignature(qstashSignature, body);
    if (isValid) {
      return { valid: true, source: "qstash" };
    }
  }

  // 3. Check manual admin trigger
  const apiKey = req.headers.get("x-api-key");
  if (apiKey === process.env.ADMIN_API_KEY) {
    return { valid: true, source: "admin" };
  }

  // 4. Check Railway worker callback
  const workerKey = req.headers.get("x-worker-key");
  if (workerKey === process.env.WORKER_API_KEY) {
    return { valid: true, source: "railway-worker" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Delegate matching to Railway worker (recommended for production)
 */
async function delegateToRailway(
  source: string,
  companyCount: number
): Promise<NextResponse> {
  let RAILWAY_URL = process.env.RAILWAY_CRAWLER_URL;
  const WORKER_API_KEY = process.env.WORKER_API_KEY;

  if (!RAILWAY_URL || !WORKER_API_KEY) {
    logger.warn("Railway not configured, falling back to direct processing");
    return executeMatchingRefreshDirect(source);
  }

  // Ensure RAILWAY_URL has https:// protocol
  if (!RAILWAY_URL.startsWith("http://") && !RAILWAY_URL.startsWith("https://")) {
    RAILWAY_URL = `https://${RAILWAY_URL}`;
  }

  try {
    logger.info(`Delegating matching refresh to Railway for ${companyCount} companies`);

    const response = await fetch(`${RAILWAY_URL}/matching/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WORKER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchSize: 20, // Process 20 companies at a time
        maxCompanies: 500, // Maximum companies to process
      }),
    });

    if (!response.ok) {
      throw new Error(`Railway worker error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    logger.info("Matching refresh delegated to Railway", { result });

    return NextResponse.json({
      success: true,
      message: `Matching refresh delegated to Railway for ${companyCount} companies`,
      companiesQueued: companyCount,
      triggeredBy: source,
      railwayResponse: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Railway delegation failed, falling back to direct", { error });
    return executeMatchingRefreshDirect(source);
  }
}

/**
 * Execute matching refresh directly (fallback or for small batches)
 */
async function executeMatchingRefreshDirect(source: string): Promise<NextResponse> {
  try {
    logger.info(`Direct matching refresh started via ${source}`);

    // Get companies with matching preferences (only process those with preferences)
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        matchingPreferences: {
          some: {}, // Has at least one preference
        },
        members: {
          some: {}, // Has at least one member
        },
      },
      select: {
        id: true,
        name: true,
        matchingPreferences: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        members: {
          take: 1,
          select: { userId: true },
        },
      },
      take: 50, // Limit for Vercel timeout (60s)
    });

    if (companies.length === 0) {
      logger.info("No companies with preferences found");
      return NextResponse.json({
        success: true,
        message: "No companies to process",
        companiesProcessed: 0,
        triggeredBy: source,
      });
    }

    let matchesRefreshed = 0;
    let resultsStored = 0;
    const errors: string[] = [];

    for (const company of companies) {
      try {
        const preference = company.matchingPreferences[0];
        const firstMember = company.members[0];

        if (!preference || !firstMember) {
          continue;
        }

        // Execute matching
        const results = await executeMatching({
          companyId: company.id,
          userId: firstMember.userId,
          preferences: {
            categories: preference.categories,
            minAmount: preference.minAmount || undefined,
            maxAmount: preference.maxAmount || undefined,
            regions: preference.regions || undefined,
            excludeKeywords: preference.excludeKeywords || undefined,
          },
        });

        // CRITICAL FIX: Store results in database
        if (results.length > 0) {
          await storeMatchingResults(
            firstMember.userId,
            company.id,
            results
          );
          resultsStored += results.length;
        }

        matchesRefreshed++;

        logger.info(`Refreshed ${results.length} matches for company ${company.id} (${company.name})`);
      } catch (error) {
        const errorMsg = `Company ${company.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        logger.error("Matching refresh error", { errorMsg });
        errors.push(errorMsg);
      }
    }

    logger.info(`Matching refresh completed: ${matchesRefreshed}/${companies.length} companies, ${resultsStored} total results stored`);

    return NextResponse.json({
      success: true,
      message: "Matching refresh completed",
      companiesProcessed: companies.length,
      companiesRefreshed: matchesRefreshed,
      resultsStored,
      triggeredBy: source,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Matching refresh error", { error });
    return NextResponse.json(
      {
        error: "Failed to refresh matching results",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Execute matching refresh (decides between Railway delegation or direct processing)
 */
async function executeMatchingRefresh(source: string): Promise<NextResponse> {
  try {
    // Count companies that need processing
    const companyCount = await prisma.company.count({
      where: {
        deletedAt: null,
        matchingPreferences: {
          some: {},
        },
        members: {
          some: {},
        },
      },
    });

    if (companyCount === 0) {
      logger.info("No companies need matching refresh");
      return NextResponse.json({
        success: true,
        message: "No companies need matching refresh",
        companiesQueued: 0,
        triggeredBy: source,
      });
    }

    logger.info(`Found ${companyCount} companies needing matching refresh`);

    // Decide: Railway for large batches (>20), direct for small
    const useRailway =
      companyCount > 20 &&
      process.env.RAILWAY_CRAWLER_URL &&
      process.env.WORKER_API_KEY;

    if (useRailway) {
      return delegateToRailway(source, companyCount);
    } else {
      return executeMatchingRefreshDirect(source);
    }
  } catch (error) {
    logger.error("Matching refresh error", { error });
    return NextResponse.json(
      {
        error: "Failed to start matching refresh",
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
    logger.error("Unauthorized GET request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeMatchingRefresh(source);
}

// QStash/Railway sends POST requests
export async function POST(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    logger.error("Unauthorized POST request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if this is a direct processing request from Railway
  const body = await req.json().catch(() => ({}));
  if (body.direct === true) {
    return executeMatchingRefreshDirect(source);
  }

  return executeMatchingRefresh(source);
}
