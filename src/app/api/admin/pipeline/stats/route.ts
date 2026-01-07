/**
 * Pipeline Stats API
 * GET /api/admin/pipeline/stats
 *
 * Returns comprehensive pipeline statistics:
 * - Parsing stats (parsed/unparsed files, error types)
 * - Embedding stats (embedded/pending projects)
 * - Attachment stats (projects with/without attachments)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ParseStats {
  total: number;
  parsable: number;
  parsed: number;
  unparsed: number;
  withError: number;
  byFileType: Record<string, number>;
  errorTypes: Record<string, number>;
}

interface EmbedStats {
  total: number;
  embedded: number;
  pending: number;
  embeddingCount: number;
}

interface AttachmentStats {
  totalProjects: number;
  withAttachments: number;
  withoutAttachments: number;
  recrawlable: number;
}

interface RecentJob {
  id: string;
  type: string;
  status: string;
  targetCount: number;
  successCount: number;
  failCount: number;
  triggeredBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PipelineStatsResponse {
  timestamp: string;
  parse: ParseStats;
  embed: EmbedStats;
  attachment: AttachmentStats;
  recentJobs: RecentJob[];
}

export async function GET(_req: NextRequest) {
  try {
    // Run all queries in parallel
    const [
      // Parse stats
      totalAttachments,
      parsableFiles,
      parsedFiles,
      unparsedFiles,
      filesWithError,
      fileTypeStats,
      errorFiles,
      // Embed stats
      totalProjects,
      needsEmbeddingCount,
      embeddingCount,
      // Attachment stats
      projectsWithoutAttachments,
      // Recent jobs
      recentJobs,
    ] = await Promise.all([
      // Parse stats
      prisma.projectAttachment.count(),
      prisma.projectAttachment.count({ where: { shouldParse: true } }),
      prisma.projectAttachment.count({ where: { shouldParse: true, isParsed: true } }),
      prisma.projectAttachment.count({ where: { shouldParse: true, isParsed: false } }),
      prisma.projectAttachment.count({
        where: { shouldParse: true, isParsed: false, parseError: { not: null } },
      }),
      prisma.projectAttachment.groupBy({
        by: ["fileType"],
        _count: { id: true },
      }),
      prisma.projectAttachment.findMany({
        where: { parseError: { not: null } },
        select: { parseError: true },
      }),
      // Embed stats
      prisma.supportProject.count({ where: { deletedAt: null } }),
      prisma.supportProject.count({ where: { needsEmbedding: true, deletedAt: null } }),
      prisma.documentEmbedding.count({ where: { sourceType: "support_project" } }),
      // Attachment stats
      prisma.supportProject.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          detailUrl: true,
          _count: { select: { attachments: true } },
        },
      }),
      // Recent jobs
      prisma.pipelineJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Process file type stats
    const byFileType: Record<string, number> = {};
    fileTypeStats.forEach((stat) => {
      byFileType[stat.fileType] = stat._count.id;
    });

    // Process error types
    const errorTypes: Record<string, number> = {};
    errorFiles.forEach((f) => {
      const errorType = categorizeError(f.parseError!);
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });

    // Calculate attachment stats
    const withoutAttachments = projectsWithoutAttachments.filter(
      (p) => p._count.attachments === 0
    );
    const recrawlable = withoutAttachments.filter((p) => p.detailUrl);

    const response: PipelineStatsResponse = {
      timestamp: new Date().toISOString(),
      parse: {
        total: totalAttachments,
        parsable: parsableFiles,
        parsed: parsedFiles,
        unparsed: unparsedFiles,
        withError: filesWithError,
        byFileType,
        errorTypes,
      },
      embed: {
        total: totalProjects,
        embedded: totalProjects - needsEmbeddingCount,
        pending: needsEmbeddingCount,
        embeddingCount,
      },
      attachment: {
        totalProjects,
        withAttachments: totalProjects - withoutAttachments.length,
        withoutAttachments: withoutAttachments.length,
        recrawlable: recrawlable.length,
      },
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        targetCount: job.targetCount,
        successCount: job.successCount,
        failCount: job.failCount,
        triggeredBy: job.triggeredBy,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Pipeline stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Categorize error messages
 */
function categorizeError(error: string): string {
  const lower = error.toLowerCase();

  if (lower.includes("download") || lower.includes("다운로드")) return "Download Failed";
  if (lower.includes("upload") || lower.includes("업로드")) return "Upload Failed";
  if (lower.includes("timeout") || lower.includes("시간")) return "Timeout";
  if (lower.includes("parse") || lower.includes("파싱")) return "Parse Failed";
  if (lower.includes("hwp") || lower.includes("한글")) return "HWP Parse Error";
  if (lower.includes("pdf")) return "PDF Parse Error";
  if (lower.includes("empty") || lower.includes("비어") || lower.includes("0 bytes"))
    return "Empty File";
  if (lower.includes("network") || lower.includes("connect")) return "Network Error";
  if (lower.includes("no text")) return "No Text Extracted";

  return "Other";
}
