/**
 * Business Plan Section Update API (PRD 4.5)
 * PATCH /api/business-plans/:id/sections/:sectionIndex - Update section
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "business-plan-section" });

const updateSectionSchema = z.object({
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
    const updatedSection = await prisma.businessPlanSection.updateMany({
      where: {
        businessPlanId: id,
        sectionIndex: sectionIdx,
      },
      data: {
        content: validatedData.content,
        isAiGenerated: false, // User manually edited
      },
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
