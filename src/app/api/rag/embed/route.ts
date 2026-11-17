/**
 * RAG Embedding API (PRD 4.8)
 * POST /api/rag/embed - Generate embeddings for content
 *
 * Upserts the embedding chunks (0..n-1) of one source, so it needs write
 * access to that source (`canAccessEmbeddings` in src/lib/rag-access.ts).
 * Each chunk is one OpenAI call, so the content length is capped.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeDocumentEmbeddings, type SourceType } from "@/lib/rag";
import { canAccessEmbeddings } from "@/lib/rag-access";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "rag-embed" });

// Chunks are 512 whitespace-separated words (50 overlap): about 50 for typical
// Korean text, at most about 110. Not exported: a route file may only export
// handlers and segment config.
const MAX_EMBED_CONTENT_LENGTH = 100_000;

const embedSchema = z.object({
  sourceType: z.enum(["support_project", "company", "business_plan"]),
  sourceId: z.string().min(1),
  content: z.string().min(1).max(MAX_EMBED_CONTENT_LENGTH),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = embedSchema.parse(body);
    const sourceType = validatedData.sourceType as SourceType;

    if (!(await canAccessEmbeddings(session.user.id, sourceType, validatedData.sourceId, "write"))) {
      logger.warn("Unauthorized embedding write attempt", {
        userId: session.user.id,
        sourceType,
        sourceId: validatedData.sourceId,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Store embeddings
    await storeDocumentEmbeddings(
      sourceType,
      validatedData.sourceId,
      validatedData.content,
      validatedData.metadata || {}
    );

    return NextResponse.json({
      success: true,
      message: "Embeddings generated and stored",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Embed error", { error });
    return NextResponse.json(
      { error: "Failed to generate embeddings" },
      { status: 500 }
    );
  }
}
