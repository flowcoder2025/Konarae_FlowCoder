/**
 * Support Project Detail API (PRD 4.3)
 * GET /api/projects/:id - Get project details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.supportProject.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            matchingResults: true,
            businessPlans: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Increment view count
    await prisma.supportProject.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error("[API] Get project error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}
