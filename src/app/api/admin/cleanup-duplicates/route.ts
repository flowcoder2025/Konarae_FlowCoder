/**
 * Admin API: Cleanup Duplicate Attachments
 * POST /api/admin/cleanup-duplicates
 *
 * Identifies and removes duplicate attachments within the same project
 * Keeps the most recent attachment for each unique (projectId, sourceUrl) pair
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "admin-cleanup-duplicates" });

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DuplicateGroup {
  projectId: string;
  sourceUrl: string;
  count: number;
  attachmentIds: string[];
  keepId: string;
  deleteIds: string[];
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    logger.info(`Starting ${dryRun ? 'DRY RUN' : 'ACTUAL CLEANUP'}...`);

    // Find all attachments grouped by projectId and sourceUrl
    const attachments = await prisma.projectAttachment.findMany({
      select: {
        id: true,
        projectId: true,
        fileName: true,
        sourceUrl: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc', // Most recent first
      },
    });

    // Group by (projectId, sourceUrl)
    const groups = new Map<string, typeof attachments>();

    for (const attachment of attachments) {
      const key = `${attachment.projectId}:${attachment.sourceUrl}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(attachment);
    }

    // Find duplicates (groups with more than 1 attachment)
    const duplicateGroups: DuplicateGroup[] = [];
    const idsToDelete: string[] = [];

    for (const [key, group] of groups.entries()) {
      if (group.length > 1) {
        // Keep the most recent (first in array since we sorted by createdAt desc)
        const keepId = group[0].id;
        const deleteIds = group.slice(1).map(a => a.id);

        const [projectId, sourceUrl] = key.split(':');

        duplicateGroups.push({
          projectId,
          sourceUrl,
          count: group.length,
          attachmentIds: group.map(a => a.id),
          keepId,
          deleteIds,
        });

        idsToDelete.push(...deleteIds);
      }
    }

    logger.info(`Found ${duplicateGroups.length} duplicate groups, ${idsToDelete.length} attachments to delete`);

    // Delete duplicates
    let deletedCount = 0;
    if (!dryRun && idsToDelete.length > 0) {
      const result = await prisma.projectAttachment.deleteMany({
        where: {
          id: { in: idsToDelete },
        },
      });
      deletedCount = result.count;
      logger.info(`Deleted ${deletedCount} duplicate attachments`);
    }

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        totalAttachments: attachments.length,
        uniqueGroups: groups.size,
        duplicateGroups: duplicateGroups.length,
        toDelete: idsToDelete.length,
        deleted: deletedCount,
      },
      details: duplicateGroups.slice(0, 50), // Limit details to first 50 for readability
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}

// GET endpoint to check for duplicates without modifying
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    // Find duplicate counts using raw query for efficiency
    const duplicates = await prisma.$queryRaw<
      Array<{ projectId: string; sourceUrl: string; count: bigint }>
    >`
      SELECT "projectId", "sourceUrl", COUNT(*) as count
      FROM "ProjectAttachment"
      GROUP BY "projectId", "sourceUrl"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    const totalDuplicates = duplicates.reduce(
      (sum, d) => sum + (Number(d.count) - 1), // Subtract 1 because we keep one
      0
    );

    return NextResponse.json({
      duplicateGroups: duplicates.length,
      totalDuplicatesToRemove: totalDuplicates,
      details: duplicates.slice(0, 20).map(d => ({
        projectId: d.projectId,
        sourceUrl: d.sourceUrl,
        count: Number(d.count),
      })),
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
