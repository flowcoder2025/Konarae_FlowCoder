/**
 * Matched Projects API
 * GET /api/companies/[id]/matched-projects
 * Returns matching results for a company (active, non-expired projects only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await params;

    // ReBAC permission check
    const canView = await check(session.user.id, "company", companyId, "viewer");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current date for deadline filtering
    const now = new Date();

    // Fetch matching results with active, non-expired projects
    const matchingResults = await prisma.matchingResult.findMany({
      where: {
        companyId,
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
    });
  } catch (error) {
    console.error("[API] Get matched projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch matched projects" },
      { status: 500 }
    );
  }
}
