/**
 * Admin Duplicate Group Detail API
 * GET /api/admin/duplicate-groups/[id] - Get group details
 * PATCH /api/admin/duplicate-groups/[id] - Update group (change canonical, status)
 * DELETE /api/admin/duplicate-groups/[id] - Dissolve group (ungroup all projects)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Group details
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;

    const group = await prisma.projectGroup.findUnique({
      where: { id },
      include: {
        canonicalProject: true,
        projects: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error("Failed to fetch group:", error);
    return NextResponse.json(
      { error: "Failed to fetch group" },
      { status: 500 }
    );
  }
}

// PATCH - Update group
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();

    const { reviewStatus, canonicalProjectId } = body;

    const group = await prisma.projectGroup.findUnique({
      where: { id },
      include: { projects: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Update canonical project if changed
    if (canonicalProjectId && canonicalProjectId !== group.canonicalProjectId) {
      // Verify the new canonical is in the group
      const isInGroup = group.projects.some((p) => p.id === canonicalProjectId);
      if (!isInGroup) {
        return NextResponse.json(
          { error: "Project is not in this group" },
          { status: 400 }
        );
      }

      // Update all projects' isCanonical flag
      await prisma.$transaction([
        // Set all projects as non-canonical
        prisma.supportProject.updateMany({
          where: { groupId: id },
          data: { isCanonical: false },
        }),
        // Set new canonical
        prisma.supportProject.update({
          where: { id: canonicalProjectId },
          data: { isCanonical: true },
        }),
        // Update group
        prisma.projectGroup.update({
          where: { id },
          data: {
            canonicalProjectId,
            ...(reviewStatus ? { reviewStatus } : {}),
          },
        }),
      ]);
    } else if (reviewStatus) {
      // Only update status
      await prisma.projectGroup.update({
        where: { id },
        data: { reviewStatus },
      });
    }

    const updatedGroup = await prisma.projectGroup.findUnique({
      where: { id },
      include: {
        canonicalProject: true,
        projects: true,
      },
    });

    return NextResponse.json(updatedGroup);
  } catch (error) {
    console.error("Failed to update group:", error);
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}

// DELETE - Dissolve group (ungroup all projects)
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;

    const group = await prisma.projectGroup.findUnique({
      where: { id },
      include: { projects: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Ungroup all projects and delete group
    await prisma.$transaction([
      prisma.supportProject.updateMany({
        where: { groupId: id },
        data: {
          groupId: null,
          isCanonical: false,
        },
      }),
      prisma.projectGroup.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Group dissolved. ${group.projects.length} projects ungrouped.`,
    });
  } catch (error) {
    console.error("Failed to dissolve group:", error);
    return NextResponse.json(
      { error: "Failed to dissolve group" },
      { status: 500 }
    );
  }
}
