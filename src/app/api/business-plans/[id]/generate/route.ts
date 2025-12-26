/**
 * Business Plan AI Generation API (PRD 4.5)
 * POST /api/business-plans/:id/generate - Generate sections with AI
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import {
  generateBusinessPlanSections,
  regenerateSection,
} from "@/lib/business-plan-generator";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "business-plan-generate" });

const generateSchema = z.object({
  mode: z.enum(["all", "section"]),
  sectionIndex: z.number().optional(),
});

export async function POST(
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
    const validatedData = generateSchema.parse(body);

    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id },
      include: {
        // 참조 사업계획서 ID 조회 (PRD 12.6 - RAG 컨텍스트에 포함)
        references: {
          select: { referencePlanId: true },
        },
      },
    });

    if (!businessPlan) {
      return NextResponse.json(
        { error: "Business plan not found" },
        { status: 404 }
      );
    }

    if (validatedData.mode === "all") {
      // Generate all sections
      if (!businessPlan.projectId || !businessPlan.newBusinessDescription) {
        return NextResponse.json(
          {
            error:
              "Project ID and new business description are required for generation",
          },
          { status: 400 }
        );
      }

      // 참조 사업계획서 ID 추출
      const referenceBusinessPlanIds = businessPlan.references.map(
        (ref) => ref.referencePlanId
      );

      const sections = await generateBusinessPlanSections({
        companyId: businessPlan.companyId,
        projectId: businessPlan.projectId,
        newBusinessDescription: businessPlan.newBusinessDescription,
        additionalNotes: businessPlan.additionalNotes || undefined,
        referenceBusinessPlanIds:
          referenceBusinessPlanIds.length > 0
            ? referenceBusinessPlanIds
            : undefined,
        businessPlanId: id, // 첨부파일 분석 결과도 포함
      });

      // Delete existing sections
      await prisma.businessPlanSection.deleteMany({
        where: { businessPlanId: id },
      });

      // Create new sections
      await prisma.businessPlanSection.createMany({
        data: sections.map((section) => ({
          businessPlanId: id,
          sectionIndex: section.sectionIndex,
          title: section.title,
          content: section.content,
          isAiGenerated: section.isAiGenerated,
        })),
      });

      // Update business plan status
      await prisma.businessPlan.update({
        where: { id },
        data: { status: "in_progress" },
      });

      return NextResponse.json({
        success: true,
        message: "All sections generated",
        sectionsCount: sections.length,
      });
    } else {
      // Regenerate single section
      if (validatedData.sectionIndex === undefined) {
        return NextResponse.json(
          { error: "Section index is required" },
          { status: 400 }
        );
      }

      const content = await regenerateSection(
        id,
        validatedData.sectionIndex
      );

      // Update section
      await prisma.businessPlanSection.updateMany({
        where: {
          businessPlanId: id,
          sectionIndex: validatedData.sectionIndex,
        },
        data: {
          content,
          isAiGenerated: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Section regenerated",
        content,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to generate business plan", { error });
    return NextResponse.json(
      { error: "Failed to generate business plan" },
      { status: 500 }
    );
  }
}
