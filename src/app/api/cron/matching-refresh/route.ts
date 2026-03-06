/**
 * Matching Refresh Cron Job
 * GET/POST /api/cron/matching-refresh
 *
 * Pure trigger - always delegates to OCI Worker.
 * Schedule: Daily at 06:00 KST (21:00 UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-matching-refresh" });

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const WORKER_TIMEOUT_MS = 30_000;

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

  const workerKey = req.headers.get("x-worker-key");
  if (workerKey === process.env.WORKER_API_KEY) {
    return { valid: true, source: "railway-worker" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Delegate matching to OCI Worker (always)
 */
async function delegateToWorker(source: string): Promise<NextResponse> {
  let workerUrl = process.env.RAILWAY_WORKER_URL;
  const workerApiKey = process.env.WORKER_API_KEY;

  if (!workerUrl || !workerApiKey) {
    logger.error("OCI Worker not configured (RAILWAY_WORKER_URL or WORKER_API_KEY missing)");
    return NextResponse.json(
      { error: "Worker not configured" },
      { status: 503 }
    );
  }

  if (!workerUrl.startsWith("http://") && !workerUrl.startsWith("https://")) {
    workerUrl = `https://${workerUrl}`;
  }

  try {
    logger.info(`Delegating matching refresh to OCI Worker via ${source}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

    const response = await fetch(`${workerUrl}/matching/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchSize: 10,
        maxCompanies: 200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Worker error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    logger.info("Matching refresh delegated successfully", { result });

    return NextResponse.json({
      success: true,
      message: "Matching refresh delegated to OCI Worker",
      triggeredBy: source,
      workerResponse: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    if (isTimeout) {
      // Worker accepted (202) but we timed out waiting - that's OK
      logger.info("Worker request timed out (likely processing in background)");
      return NextResponse.json({
        success: true,
        message: "Matching refresh triggered (worker processing in background)",
        triggeredBy: source,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error("Worker delegation failed", { error });
    return NextResponse.json(
      {
        error: "Failed to delegate matching refresh",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return delegateToWorker(source);
}

export async function POST(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return delegateToWorker(source);
}
