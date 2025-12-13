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
    console.log(`[Cron] Embedding generation started via ${source} at`, new Date().toISOString());

    // Count projects needing embeddings
    const projectCount = await prisma.supportProject.count({
      where: {
        needsEmbedding: true,
        deletedAt: null,
      },
    });

    if (projectCount === 0) {
      console.log("[Cron] No projects need embeddings");
      return NextResponse.json({
        success: true,
        message: "No projects need embeddings",
        projectsQueued: 0,
        triggeredBy: source,
      });
    }

    console.log(`[Cron] Found ${projectCount} project(s) needing embeddings`);

    // Delegate to Railway worker (no time limit)
    let RAILWAY_URL = process.env.RAILWAY_CRAWLER_URL;
    const WORKER_API_KEY = process.env.WORKER_API_KEY;

    if (!RAILWAY_URL || !WORKER_API_KEY) {
      console.error("[Cron] Railway configuration missing");
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

    console.log(`[Cron] Embedding generation delegated to Railway:`, result);

    return NextResponse.json({
      success: true,
      message: `Embedding generation started for ${projectCount} project(s)`,
      projectsQueued: projectCount,
      triggeredBy: source,
      railwayResponse: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Embedding generation error:", error);
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
    console.error("[Cron] Unauthorized GET request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeEmbeddingGeneration(source);
}

// QStash sends POST requests
export async function POST(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    console.error("[Cron] Unauthorized POST request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeEmbeddingGeneration(source);
}
