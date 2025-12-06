/**
 * Matching Results API (PRD 4.4)
 * GET /api/matching/results - List matching results
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const where: any = {
      userId: session.user.id,
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
    console.error("[API] Get matching results error:", error);
    return NextResponse.json(
      { error: "Failed to fetch matching results" },
      { status: 500 }
    );
  }
}
