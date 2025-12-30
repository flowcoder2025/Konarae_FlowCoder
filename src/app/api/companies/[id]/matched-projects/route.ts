/**
 * Matched Projects API
 * GET /api/companies/[id]/matched-projects
 * Returns matching results for a company (active, non-expired projects only)
 *
 * Query params:
 * - minScore: Minimum matching score filter (default: 60)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "company-matched-projects" });

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Default minimum score for recommended projects
const DEFAULT_MIN_SCORE = 50;

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await params;
    const { searchParams } = new URL(req.url);

    // Parse minScore parameter (default: 60)
    const minScore = parseInt(searchParams.get("minScore") || String(DEFAULT_MIN_SCORE));

    // ReBAC permission check
    const canView = await check(session.user.id, "company", companyId, "viewer");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current date for deadline filtering
    const now = new Date();

    // Fetch matching results with active, non-expired projects and minimum score
    const matchingResults = await prisma.matchingResult.findMany({
      where: {
        companyId,
        totalScore: { gte: minScore }, // Filter by minimum score
        project: {
          deletedAt: null,
          status: "active",
          OR: [
            { isPermanent: true },
            { deadline: { gte: now } },
            { deadline: null }, // No deadline set
          ],
        },
      },
      orderBy: {
        totalScore: "desc",
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            category: true,
            subCategory: true,
            summary: true,
            amountMin: true,
            amountMax: true,
            startDate: true,
            endDate: true,
            deadline: true,
            isPermanent: true,
            evaluationCriteria: true,
          },
        },
      },
      take: 50, // Limit to top 50 matches
    });

    // Transform to response format
    const matchedProjects = matchingResults.map((result) => ({
      id: result.project.id,
      name: result.project.name,
      organization: result.project.organization,
      category: result.project.category,
      subCategory: result.project.subCategory,
      summary: result.project.summary,
      amountMin: result.project.amountMin?.toString() || null,
      amountMax: result.project.amountMax?.toString() || null,
      startDate: result.project.startDate,
      endDate: result.project.endDate,
      deadline: result.project.deadline,
      isPermanent: result.project.isPermanent,
      hasEvaluationCriteria: !!result.project.evaluationCriteria,
      // Matching info
      matchingScore: result.totalScore,
      confidence: result.confidence,
      matchReasons: result.matchReasons,
    }));

    return NextResponse.json({
      projects: matchedProjects,
      total: matchedProjects.length,
      companyId,
      minScore, // Return applied minimum score filter
    });
  } catch (error) {
    logger.error("Failed to fetch matched projects", { error });
    return NextResponse.json(
      { error: "Failed to fetch matched projects" },
      { status: 500 }
    );
  }
}
