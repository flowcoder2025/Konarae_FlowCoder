/**
 * RAG Embeddings Management API (PRD 4.8)
 * GET /api/rag/embeddings/:sourceType/:sourceId - Get embedding info
 * DELETE /api/rag/embeddings/:sourceType/:sourceId - Delete embeddings
 *
 * GET needs read access and DELETE write access to the source
 * (`canAccessEmbeddings` in src/lib/rag-access.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessEmbeddings } from "@/lib/rag-access";
import {
  getEmbeddingCount,
  deleteEmbeddings,
  type SourceType,
} from "@/lib/rag";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "rag-embeddings" });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sourceType: string; sourceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sourceType, sourceId } = await params;

    if (
      !["support_project", "company", "business_plan"].includes(sourceType)
    ) {
      return NextResponse.json(
        { error: "Invalid source type" },
        { status: 400 }
      );
    }

    if (!(await canAccessEmbeddings(session.user.id, sourceType as SourceType, sourceId, "read"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const count = await getEmbeddingCount(
      sourceType as SourceType,
      sourceId
    );

    return NextResponse.json({
      sourceType,
      sourceId,
      embeddingCount: count,
    });
  } catch (error) {
    logger.error("Get embeddings failed", { error });
    return NextResponse.json(
      { error: "Failed to get embeddings" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sourceType: string; sourceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sourceType, sourceId } = await params;

    if (
      !["support_project", "company", "business_plan"].includes(sourceType)
    ) {
      return NextResponse.json(
        { error: "Invalid source type" },
        { status: 400 }
      );
    }

    const hasPermission = await canAccessEmbeddings(
      session.user.id,
      sourceType as SourceType,
      sourceId,
      "write"
    );

    if (!hasPermission) {
      logger.warn("Unauthorized embedding deletion attempt", {
        userId: session.user.id,
        sourceType,
        sourceId,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteEmbeddings(sourceType as SourceType, sourceId);

    logger.info("Embeddings deleted", { sourceType, sourceId });
    return NextResponse.json({
      success: true,
      message: "Embeddings deleted",
    });
  } catch (error) {
    logger.error("Delete embeddings failed", { error });
    return NextResponse.json(
      { error: "Failed to delete embeddings" },
      { status: 500 }
    );
  }
}
