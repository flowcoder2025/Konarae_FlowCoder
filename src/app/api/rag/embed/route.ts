/**
 * RAG Embedding API (PRD 4.8)
 * POST /api/rag/embed - Generate embeddings for content
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeDocumentEmbeddings, type SourceType } from "@/lib/rag";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "rag-embed" });

const embedSchema = z.object({
  sourceType: z.enum(["support_project", "company", "business_plan"]),
  sourceId: z.string().min(1),
  content: z.string().min(1),
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

    // Store embeddings
    await storeDocumentEmbeddings(
      validatedData.sourceType as SourceType,
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
