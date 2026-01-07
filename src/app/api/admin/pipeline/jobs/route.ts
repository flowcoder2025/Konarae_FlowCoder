/**
 * Pipeline Jobs API
 * GET /api/admin/pipeline/jobs - Get job history
 *
 * Query params:
 * - type: Filter by job type (crawl, parse, embed)
 * - status: Filter by status
 * - limit: Number of jobs to return (default 20, max 100)
 * - offset: Pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PipelineJobResponse {
  id: string;
  type: string;
  status: string;
  targetCount: number;
  successCount: number;
  failCount: number;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  duration: number | null; // in seconds
}

interface JobsListResponse {
  jobs: PipelineJobResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {};

    if (type) {
      const validTypes = ["crawl", "parse", "embed"];
      if (validTypes.includes(type)) {
        whereClause.type = type;
      }
    }

    if (status) {
      const validStatuses = ["pending", "running", "completed", "failed"];
      if (validStatuses.includes(status)) {
        whereClause.status = status;
      }
    }

    // Get jobs with count
    const [jobs, total] = await Promise.all([
      prisma.pipelineJob.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.pipelineJob.count({ where: whereClause }),
    ]);

    const response: JobsListResponse = {
      jobs: jobs.map((job) => {
        // Calculate duration
        let duration: number | null = null;
        if (job.startedAt && job.completedAt) {
          duration = Math.round(
            (job.completedAt.getTime() - job.startedAt.getTime()) / 1000
          );
        }

        return {
          id: job.id,
          type: job.type,
          status: job.status,
          targetCount: job.targetCount,
          successCount: job.successCount,
          failCount: job.failCount,
          params: job.params as Record<string, unknown> | null,
          result: job.result as Record<string, unknown> | null,
          error: job.error,
          triggeredBy: job.triggeredBy,
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
          createdAt: job.createdAt.toISOString(),
          duration,
        };
      }),
      total,
      limit,
      offset,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Pipeline jobs GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
