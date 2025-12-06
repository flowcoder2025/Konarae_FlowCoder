/**
 * RAG Embeddings Management API (PRD 4.8)
 * GET /api/rag/embeddings/:sourceType/:sourceId - Get embedding info
 * DELETE /api/rag/embeddings/:sourceType/:sourceId - Delete embeddings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getEmbeddingCount,
  deleteEmbeddings,
  type SourceType,
} from "@/lib/rag";

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
    console.error("[API] Get embeddings error:", error);
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

    // TODO: Add permission check based on sourceType
    // For now, only authenticated users can delete

    await deleteEmbeddings(sourceType as SourceType, sourceId);

    return NextResponse.json({
      success: true,
      message: "Embeddings deleted",
    });
  } catch (error) {
    console.error("[API] Delete embeddings error:", error);
    return NextResponse.json(
      { error: "Failed to delete embeddings" },
      { status: 500 }
    );
  }
}
