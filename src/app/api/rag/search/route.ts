/**
 * RAG Search API (PRD 4.8)
 * POST /api/rag/search - Hybrid semantic + keyword search
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hybridSearch, type SourceType } from "@/lib/rag";
import { z } from "zod";

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

    // Hybrid search
    const results = await hybridSearch({
      queryText: validatedData.query,
      sourceType: validatedData.sourceType as SourceType | undefined,
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

    console.error("[API] RAG search error:", error);
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
