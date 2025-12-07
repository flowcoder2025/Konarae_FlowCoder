/**
 * Admin Crawler Jobs API
 * List all crawl jobs (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";

/**
 * GET /api/admin/crawler/jobs
 * List all crawl jobs
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status");

    const where = status ? { status } : {};

    const [jobs, total] = await Promise.all([
      prisma.crawlJob.findMany({
        where,
        include: {
          source: {
            select: {
              id: true,
              name: true,
              url: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.crawlJob.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
