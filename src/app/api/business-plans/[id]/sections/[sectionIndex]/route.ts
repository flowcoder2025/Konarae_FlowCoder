/**
 * Business Plan Section API (PRD 4.5)
 * PATCH /api/business-plans/:id/sections/:sectionIndex - Update section
 * DELETE /api/business-plans/:id/sections/:sectionIndex - Delete section
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "business-plan-section" });

const updateSectionSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionIndex: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sectionIndex } = await params;
    const sectionIdx = parseInt(sectionIndex, 10);

    if (isNaN(sectionIdx)) {
      return NextResponse.json(
        { error: "Invalid section index" },
        { status: 400 }
      );
    }

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
    const validatedData = updateSectionSchema.parse(body);

    // Update section
    const updateData: { content: string; isAiGenerated: boolean; title?: string } = {
      content: validatedData.content,
      isAiGenerated: false, // User manually edited
    };

    if (validatedData.title) {
      updateData.title = validatedData.title;
    }

    const updatedSection = await prisma.businessPlanSection.updateMany({
      where: {
        businessPlanId: id,
        sectionIndex: sectionIdx,
      },
      data: updateData,
    });

    if (updatedSection.count === 0) {
      return NextResponse.json(
        { error: "Section not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Section updated",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to update section", { error });
    return NextResponse.json(
      { error: "Failed to update section" },
      { status: 500 }
    );
  }
}

// DELETE - Delete section
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionIndex: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sectionIndex } = await params;
    const sectionIdx = parseInt(sectionIndex, 10);

    if (isNaN(sectionIdx)) {
      return NextResponse.json(
        { error: "Invalid section index" },
        { status: 400 }
      );
    }

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

    // Delete section
    const deletedSection = await prisma.businessPlanSection.deleteMany({
      where: {
        businessPlanId: id,
        sectionIndex: sectionIdx,
      },
    });

    if (deletedSection.count === 0) {
      return NextResponse.json(
        { error: "Section not found" },
        { status: 404 }
      );
    }

    // 삭제된 섹션 이후의 인덱스 재정렬
    await prisma.businessPlanSection.updateMany({
      where: {
        businessPlanId: id,
        sectionIndex: { gt: sectionIdx },
      },
      data: {
        sectionIndex: { decrement: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Section deleted",
    });
  } catch (error) {
    logger.error("Failed to delete section", { error });
    return NextResponse.json(
      { error: "Failed to delete section" },
      { status: 500 }
    );
  }
}
