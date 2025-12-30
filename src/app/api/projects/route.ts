/**
 * Support Projects API (PRD 4.3)
 * GET /api/projects - List projects with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached, rateLimit, cacheTTL } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { PAGINATION, RATE_LIMIT } from "@/lib/constants";

const logger = createLogger({ api: "projects" });

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(
      `projects:${session.user.id}`,
      RATE_LIMIT.REQUESTS_PER_WINDOW,
      RATE_LIMIT.WINDOW_SECONDS
    );
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT.REQUESTS_PER_WINDOW),
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
    const page = parseInt(searchParams.get("page") || String(PAGINATION.DEFAULT_PAGE));
    const pageSize = parseInt(searchParams.get("pageSize") || String(PAGINATION.DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * pageSize;

    // Build where clause with AND structure for combining multiple OR conditions
    // 중복 프로젝트 필터링: canonical만 표시 (또는 그룹 미할당)
    const conditions: any[] = [
      { deletedAt: null },
      { status },
      // Canonical 필터: 대표 프로젝트 또는 미그룹화 프로젝트만
      {
        OR: [
          { isCanonical: true },
          { groupId: null },
        ],
      },
    ];

    if (category) {
      conditions.push({ category });
    }

    if (region) {
      conditions.push({ region });
    }

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { organization: { contains: search, mode: "insensitive" } },
          { summary: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where = { AND: conditions };

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
        "X-RateLimit-Limit": String(RATE_LIMIT.REQUESTS_PER_WINDOW),
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": rateLimitResult.reset.toString(),
      }
    });
  } catch (error) {
    logger.error("Failed to fetch projects", { error });
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
