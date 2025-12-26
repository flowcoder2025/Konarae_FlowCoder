/**
 * RAG Embeddings Management API (PRD 4.8)
 * GET /api/rag/embeddings/:sourceType/:sourceId - Get embedding info
 * DELETE /api/rag/embeddings/:sourceType/:sourceId - Delete embeddings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import {
  checkCompanyPermission,
  checkBusinessPlanPermission,
} from "@/lib/rebac";
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

    // Permission check based on sourceType
    let hasPermission = false;

    switch (sourceType) {
      case "support_project":
        // Only admin can delete support project embeddings
        hasPermission = await isAdmin(session.user.id);
        break;
      case "company":
        // Company owner or admin can delete company embeddings
        hasPermission = await checkCompanyPermission(
          session.user.id,
          sourceId,
          "admin"
        );
        break;
      case "business_plan":
        // Business plan owner can delete embeddings
        hasPermission = await checkBusinessPlanPermission(
          session.user.id,
          sourceId,
          "owner"
        );
        break;
    }

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
