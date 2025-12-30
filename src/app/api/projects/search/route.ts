/**
 * Support Project Search API (PRD 4.3)
 * GET /api/projects/search - Semantic search using RAG
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hybridSearch } from "@/lib/rag";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "projects-search" });

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    // Hybrid search using RAG (PRD 12.5)
    const searchResults = await hybridSearch({
      queryText: query,
      sourceType: "support_project",
      matchThreshold: 0.6,
      matchCount: 20,
      semanticWeight: 0.7,
    });

    // Group by source_id (project)
    const projectIds = Array.from(
      new Set(searchResults.map((r) => r.sourceId))
    );

    // Fetch full project details
    const projects = await prisma.supportProject.findMany({
      where: {
        id: { in: projectIds },
        deletedAt: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        subCategory: true,
        target: true,
        region: true,
        amountMin: true,
        amountMax: true,
        startDate: true,
        endDate: true,
        deadline: true,
        summary: true,
        viewCount: true,
        bookmarkCount: true,
      },
    });

    // Add relevance scores
    const projectsWithScores = projects.map((project) => {
      const projectResults = searchResults.filter(
        (r) => r.sourceId === project.id
      );
      const avgScore =
        projectResults.reduce((sum, r) => sum + r.combinedScore, 0) /
        projectResults.length;

      return {
        ...project,
        relevanceScore: avgScore,
        matchedChunks: projectResults.length,
      };
    });

    // Sort by relevance
    projectsWithScores.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return NextResponse.json({
      projects: projectsWithScores,
      query,
      totalMatches: searchResults.length,
    });
  } catch (error) {
    logger.error("Search projects error", { error });
    return NextResponse.json(
      { error: "Failed to search projects" },
      { status: 500 }
    );
  }
}
