/**
 * RAG Search API (PRD 4.8)
 * POST /api/rag/search - Hybrid semantic + keyword search
 *
 * `hybridSearch` cannot filter by source id, so company and business_plan
 * embeddings (private to their owners) are searchable only by an admin. A
 * non-admin who names no source type searches support projects (public).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminSession } from "@/lib/auth-utils";
import { hybridSearch, type SourceType } from "@/lib/rag";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "rag-search" });

const searchSchema = z.object({
  query: z.string().min(1),
  sourceType: z.enum(["support_project", "company", "business_plan"]).optional(),
  matchThreshold: z.number().min(0).max(1).optional(),
  matchCount: z.number().min(1).max(100).optional(),
  semanticWeight: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = searchSchema.parse(body);

    let sourceType = validatedData.sourceType as SourceType | undefined;
    if (sourceType !== "support_project" && (await getAdminSession()) === null) {
      if (sourceType !== undefined) {
        logger.warn("Unauthorized embedding search attempt", {
          userId: session.user.id,
          sourceType,
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      sourceType = "support_project";
    }

    // Hybrid search
    const results = await hybridSearch({
      queryText: validatedData.query,
      sourceType,
      matchThreshold: validatedData.matchThreshold,
      matchCount: validatedData.matchCount,
      semanticWeight: validatedData.semanticWeight,
    });

    return NextResponse.json({
      results,
      query: validatedData.query,
      totalMatches: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to perform RAG search", { error });
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
