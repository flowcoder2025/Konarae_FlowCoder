/**
 * Admin Duplicate Groups API
 * GET /api/admin/duplicate-groups - List duplicate groups
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending_review";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where = status === "all" ? {} : { reviewStatus: status };

    const [groups, total, stats] = await Promise.all([
      prisma.projectGroup.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          canonicalProject: {
            select: {
              id: true,
              name: true,
              organization: true,
              deadline: true,
              status: true,
            },
          },
          projects: {
            select: {
              id: true,
              name: true,
              organization: true,
              deadline: true,
              status: true,
              isCanonical: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.projectGroup.count({ where }),
      prisma.projectGroup.groupBy({
        by: ["reviewStatus"],
        _count: true,
      }),
    ]);

    const statusCounts = stats.reduce(
      (acc, { reviewStatus, _count }) => {
        acc[reviewStatus] = _count;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      groups,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: statusCounts,
    });
  } catch (error) {
    console.error("Failed to fetch duplicate groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch duplicate groups" },
      { status: 500 }
    );
  }
}
