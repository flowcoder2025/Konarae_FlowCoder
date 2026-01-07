/**
 * Pipeline Embed API
 * POST /api/admin/pipeline/embed
 *
 * Triggers embedding generation for projects with needsEmbedding=true
 * Uses existing embedding generation logic
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

// Railway Worker URL for embedding generation
const RAILWAY_WORKER_URL = process.env.RAILWAY_WORKER_URL || process.env.RAILWAY_CRAWLER_URL;
const WORKER_API_KEY = process.env.WORKER_API_KEY;

interface EmbedRequest {
  batchSize?: number;
  projectIds?: string[]; // Specific project IDs to embed
  force?: boolean; // Force re-embed even if already embedded
}

interface EmbedResult {
  jobId: string;
  mode: "local" | "worker";
  processed: number;
  success: number;
  failed: number;
  message: string;
  details?: Array<{
    id: string;
    name: string;
    status: "success" | "failed" | "skipped";
    message?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body: EmbedRequest = await req.json();
    const { batchSize = 50, projectIds, force = false } = body;

    // Create pipeline job record
    const pipelineJob = await prisma.pipelineJob.create({
      data: {
        type: "embed",
        status: "running",
        triggeredBy: "manual",
        params: { batchSize, projectIds, force },
        startedAt: new Date(),
      },
    });

    // Build query for projects needing embedding
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {
      deletedAt: null,
    };

    if (projectIds && projectIds.length > 0) {
      whereClause.id = { in: projectIds };
      if (!force) {
        whereClause.needsEmbedding = true;
      }
    } else {
      whereClause.needsEmbedding = true;
    }

    // Count total projects needing embedding
    const totalPending = await prisma.supportProject.count({ where: whereClause });

    // Update job target count
    await prisma.pipelineJob.update({
      where: { id: pipelineJob.id },
      data: { targetCount: Math.min(totalPending, batchSize) },
    });

    // Try to use Railway Worker for better performance
    if (RAILWAY_WORKER_URL && WORKER_API_KEY) {
      try {
        const workerUrl = RAILWAY_WORKER_URL.startsWith("http")
          ? RAILWAY_WORKER_URL
          : `https://${RAILWAY_WORKER_URL}`;

        const response = await fetch(`${workerUrl}/api/embed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${WORKER_API_KEY}`,
          },
          body: JSON.stringify({
            batchSize,
            projectIds,
            force,
            pipelineJobId: pipelineJob.id,
          }),
        });

        if (response.ok) {
          const workerResult = await response.json();

          // Update job with worker response
          await prisma.pipelineJob.update({
            where: { id: pipelineJob.id },
            data: {
              status: "completed",
              successCount: workerResult.success || 0,
              failCount: workerResult.failed || 0,
              result: workerResult,
              completedAt: new Date(),
            },
          });

          return NextResponse.json({
            jobId: pipelineJob.id,
            mode: "worker",
            processed: workerResult.processed || 0,
            success: workerResult.success || 0,
            failed: workerResult.failed || 0,
            message: "Embedding generation delegated to Railway Worker",
          } as EmbedResult);
        }
      } catch (workerError) {
        console.warn("Railway Worker unavailable, falling back to local processing:", workerError);
      }
    }

    // Fallback: Local processing (limited due to Vercel timeout)
    const projects = await prisma.supportProject.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        organization: true,
        category: true,
        region: true,
        eligibility: true,
        attachments: {
          where: { isParsed: true, parsedContent: { not: null } },
          select: { parsedContent: true },
        },
      },
      take: Math.min(batchSize, 10), // Limit for local processing
    });

    const results: EmbedResult["details"] = [];
    let successCount = 0;
    let failCount = 0;

    for (const project of projects) {
      try {
        // Build content for embedding
        const contentParts = [
          project.name,
          project.description,
          project.organization,
          project.category,
          project.region,
          project.eligibility,
          ...project.attachments.map((a) => a.parsedContent).filter(Boolean),
        ].filter(Boolean);

        const content = contentParts.join("\n\n").substring(0, 8000);

        if (content.length < 100) {
          results.push({
            id: project.id,
            name: project.name,
            status: "skipped",
            message: "Content too short",
          });
          continue;
        }

        // Generate embedding using OpenAI
        const embedding = await generateEmbedding(content);

        if (!embedding) {
          failCount++;
          results.push({
            id: project.id,
            name: project.name,
            status: "failed",
            message: "Embedding generation failed",
          });
          continue;
        }

        // Upsert embedding to database
        const embeddingId = `proj_${project.id}_0`;

        await prisma.$executeRaw`
          INSERT INTO document_embeddings (id, source_type, source_id, content, chunk_index, embedding, keywords, created_at, updated_at)
          VALUES (
            ${embeddingId}::uuid,
            'support_project',
            ${project.id},
            ${content.substring(0, 5000)},
            0,
            ${embedding}::vector,
            ${extractKeywords(content)}::text[],
            NOW(),
            NOW()
          )
          ON CONFLICT (source_type, source_id, chunk_index)
          DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            keywords = EXCLUDED.keywords,
            updated_at = NOW()
        `;

        // Update project flag
        await prisma.supportProject.update({
          where: { id: project.id },
          data: { needsEmbedding: false },
        });

        successCount++;
        results.push({
          id: project.id,
          name: project.name,
          status: "success",
        });
      } catch (error) {
        failCount++;
        results.push({
          id: project.id,
          name: project.name,
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update job with results
    await prisma.pipelineJob.update({
      where: { id: pipelineJob.id },
      data: {
        status: "completed",
        successCount,
        failCount,
        result: { details: results },
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      jobId: pipelineJob.id,
      mode: "local",
      processed: results.length,
      success: successCount,
      failed: failCount,
      message: `Local processing completed. ${totalPending - results.length} projects remaining.`,
      details: results,
    } as EmbedResult);
  } catch (error) {
    console.error("Embed pipeline error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Generate embedding using OpenAI
 */
async function generateEmbedding(text: string): Promise<string | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.substring(0, 8000),
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return null;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (!embedding) {
      return null;
    }

    // Convert to PostgreSQL vector format
    return `[${embedding.join(",")}]`;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction - remove common words and get unique terms
  const stopWords = new Set([
    "의", "가", "이", "은", "들", "는", "좀", "잘", "걍", "과", "도", "를", "으로",
    "자", "에", "와", "한", "하다", "및", "등", "위", "수", "것", "더", "년", "월",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "and", "or", "but", "if", "then", "else", "when", "where", "what", "which",
    "who", "whom", "this", "that", "these", "those", "am", "for", "on", "in", "to",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word));

  // Get unique words, limit to 50
  const uniqueWords = [...new Set(words)].slice(0, 50);

  return uniqueWords;
}
