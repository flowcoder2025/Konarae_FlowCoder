/**
 * Matching Results API (PRD 4.4) - v3
 * GET /api/matching/results - List matching results (filtered: active, non-expired, qualified)
 * PATCH /api/matching/results - Mark results as viewed (viewedAt)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "matching-results" });

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const confidence = searchParams.get("confidence");

    // Build where clause
    const now = new Date();
    const where: any = {
      userId: session.user.id,
      disqualified: false, // v3: hide disqualified results
      // v3: only show results for active, non-expired projects
      project: {
        status: "active",
        deletedAt: null,
        OR: [
          { isPermanent: true },
          { deadline: { gte: now } },
        ],
      },
    };

    if (companyId) {
      where.companyId = companyId;
    }

    if (confidence) {
      where.confidence = confidence;
    }

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const skip = (page - 1) * pageSize;

    const [results, total] = await Promise.all([
      prisma.matchingResult.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { totalScore: "desc" },
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
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.matchingResult.count({ where }),
    ]);

    return NextResponse.json({
      results,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error("Failed to fetch matching results", { error });
    return NextResponse.json(
      { error: "Failed to fetch matching results" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/matching/results - Mark results as viewed
 * Body: { resultIds: string[] }
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resultIds } = await req.json();

    if (!Array.isArray(resultIds) || resultIds.length === 0) {
      return NextResponse.json({ error: "resultIds required" }, { status: 400 });
    }

    const updated = await prisma.matchingResult.updateMany({
      where: {
        id: { in: resultIds },
        userId: session.user.id,
        viewedAt: null,
      },
      data: { viewedAt: new Date() },
    });

    return NextResponse.json({ marked: updated.count });
  } catch (error) {
    logger.error("Failed to mark results as viewed", { error });
    return NextResponse.json(
      { error: "Failed to mark results" },
      { status: 500 }
    );
  }
}
