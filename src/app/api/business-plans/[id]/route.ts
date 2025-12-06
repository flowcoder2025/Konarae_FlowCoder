/**
 * Business Plan Detail API (PRD 4.5)
 * GET /api/business-plans/:id - Get business plan
 * PATCH /api/business-plans/:id - Update business plan
 * DELETE /api/business-plans/:id - Delete business plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { z } from "zod";

const updateBusinessPlanSchema = z.object({
  title: z.string().min(1).optional(),
  status: z
    .enum(["draft", "in_progress", "completed", "submitted"])
    .optional(),
  newBusinessDescription: z.string().optional(),
  additionalNotes: z.string().optional(),
});

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

    // Check permission (viewer+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "viewer"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id, deletedAt: null },
      include: {
        company: true,
        project: true,
        sections: {
          orderBy: { sectionIndex: "asc" },
        },
        evaluations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!businessPlan) {
      return NextResponse.json(
        { error: "Business plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ businessPlan });
  } catch (error) {
    console.error("[API] Get business plan error:", error);
    return NextResponse.json(
      { error: "Failed to fetch business plan" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (editor+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "editor"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = updateBusinessPlanSchema.parse(body);

    const businessPlan = await prisma.businessPlan.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json({
      success: true,
      businessPlan,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[API] Update business plan error:", error);
    return NextResponse.json(
      { error: "Failed to update business plan" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (owner)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "owner"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete
    await prisma.businessPlan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: "Business plan deleted",
    });
  } catch (error) {
    console.error("[API] Delete business plan error:", error);
    return NextResponse.json(
      { error: "Failed to delete business plan" },
      { status: 500 }
    );
  }
}
