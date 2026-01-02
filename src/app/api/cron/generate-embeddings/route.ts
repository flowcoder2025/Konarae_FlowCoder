/**
 * Generate Embeddings Cron Job
 * GET/POST /api/cron/generate-embeddings
 *
 * Triggers Railway worker to generate embeddings for projects with needsEmbedding=true
 * Runs daily to process crawled projects asynchronously
 *
 * Schedule: Daily at 05:00 KST (20:00 UTC previous day)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-generate-embeddings" });

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Verify request authorization
 */
async function verifyAuthorization(req: NextRequest): Promise<{ valid: boolean; source: string }> {
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

  return { valid: false, source: "unknown" };
}

/**
 * Execute embedding generation
 */
async function executeEmbeddingGeneration(source: string): Promise<NextResponse> {
  try {
    logger.info(`Embedding generation started via ${source}`);

    // Count projects needing embeddings
    const projectCount = await prisma.supportProject.count({
      where: {
        needsEmbedding: true,
        deletedAt: null,
      },
    });

    if (projectCount === 0) {
      logger.info("No projects need embeddings");
      return NextResponse.json({
        success: true,
        message: "No projects need embeddings",
        projectsQueued: 0,
        triggeredBy: source,
      });
    }

    logger.info(`Found ${projectCount} project(s) needing embeddings`);

    // Delegate to Railway embedding worker (분리된 임베딩 전용 워커)
    let RAILWAY_URL = process.env.RAILWAY_WORKER_URL;
    const WORKER_API_KEY = process.env.WORKER_API_KEY;

    if (!RAILWAY_URL || !WORKER_API_KEY) {
      logger.error("Railway configuration missing (RAILWAY_WORKER_URL or WORKER_API_KEY)");
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
    }

    // Send request to Railway worker
    const response = await fetch(`${RAILWAY_URL}/generate-embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WORKER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batchSize: 50, // Process 50 projects at a time
      }),
    });

    if (!response.ok) {
      throw new Error(`Railway worker error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    logger.info("Embedding generation delegated to Railway", { result });

    return NextResponse.json({
      success: true,
      message: `Embedding generation started for ${projectCount} project(s)`,
      projectsQueued: projectCount,
      triggeredBy: source,
      railwayResponse: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Embedding generation error", { error });
    return NextResponse.json(
      {
        error: "Failed to start embedding generation",
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

  return executeEmbeddingGeneration(source);
}

// QStash sends POST requests
export async function POST(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    logger.error("Unauthorized POST request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeEmbeddingGeneration(source);
}
