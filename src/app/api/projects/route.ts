/**
 * Support Projects API (PRD 4.3)
 * GET /api/projects - List projects with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached, rateLimit, cacheKeys, cacheTTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting (10 requests per minute per user)
    const rateLimitResult = await rateLimit(`projects:${session.user.id}`, 10, 60);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          }
        }
      );
    }

    const { searchParams } = new URL(req.url);

    // Filters
    const category = searchParams.get("category");
    const region = searchParams.get("region");
    const status = searchParams.get("status") || "active";
    const search = searchParams.get("search");

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {
      deletedAt: null,
      status,
    };

    if (category) {
      where.category = category;
    }

    if (region) {
      where.region = region;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { organization: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    // Cache key based on query params
    const cacheKey = `projects:list:${JSON.stringify({ category, region, status, search, page, pageSize })}`;

    // Query with caching (5 minutes TTL)
    const result = await getCached(
      cacheKey,
      async () => {
        const [projects, total] = await Promise.all([
          prisma.supportProject.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              externalId: true,
              name: true,
              organization: true,
              category: true,
              subCategory: true,
              target: true,
              region: true,
              amountMin: true,
              amountMax: true,
              amountDescription: true,
              startDate: true,
              endDate: true,
              deadline: true,
              isPermanent: true,
              summary: true,
              status: true,
              viewCount: true,
              bookmarkCount: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.supportProject.count({ where }),
        ]);

        return {
          projects,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        };
      },
      cacheTTL.medium
    );

    return NextResponse.json(result, {
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": rateLimitResult.reset.toString(),
      }
    });
  } catch (error) {
    console.error("[API] Get projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
