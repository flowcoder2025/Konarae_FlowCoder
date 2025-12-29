/**
 * Business Plans API (PRD 4.5)
 * GET /api/business-plans - List business plans
 * POST /api/business-plans - Create business plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { grant } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "business-plans" });

// 구조화된 입력 스키마
const milestoneSchema = z.object({
  phase: z.string(),
  period: z.string(),
  tasks: z.string(),
  deliverables: z.string(),
});

const executionPlanSchema = z.object({
  duration: z.string(),
  milestones: z.array(milestoneSchema),
  teamPlan: z.string().optional(),
}).optional();

const budgetItemSchema = z.object({
  category: z.string(),
  amount: z.number(),
  description: z.string().optional(),
});

const budgetPlanSchema = z.object({
  totalAmount: z.number(),
  governmentFunding: z.number(),
  selfFunding: z.number(),
  breakdown: z.array(budgetItemSchema).optional(),
}).optional();

const expectedOutcomesSchema = z.object({
  revenueTarget: z.string().optional(),
  employmentTarget: z.string().optional(),
  exportTarget: z.string().optional(),
  patentTarget: z.string().optional(),
  otherMetrics: z.array(z.string()).optional(),
}).optional();

const createBusinessPlanSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  title: z.string().min(1),
  newBusinessDescription: z.string().optional(),
  additionalNotes: z.string().optional(),
  referenceBusinessPlanIds: z.array(z.string()).optional(),
  // 구조화된 입력 (Phase 1)
  executionPlan: executionPlanSchema,
  budgetPlan: budgetPlanSchema,
  expectedOutcomes: expectedOutcomesSchema,
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status");

    // Build where clause
    const where: any = {
      userId: session.user.id,
      deletedAt: null,
    };

    if (companyId) {
      where.companyId = companyId;
    }

    if (status) {
      where.status = status;
    }

    const businessPlans = await prisma.businessPlan.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
          },
        },
        _count: {
          select: {
            sections: true,
            evaluations: true,
          },
        },
      },
    });

    return NextResponse.json({ businessPlans });
  } catch (error) {
    logger.error("Failed to fetch business plans", { error });
    return NextResponse.json(
      { error: "Failed to fetch business plans" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = createBusinessPlanSchema.parse(body);

    // Create business plan
    const businessPlan = await prisma.$transaction(async (tx) => {
      const plan = await tx.businessPlan.create({
        data: {
          userId: session.user.id,
          companyId: validatedData.companyId,
          projectId: validatedData.projectId,
          title: validatedData.title,
          status: "draft",
          newBusinessDescription: validatedData.newBusinessDescription,
          additionalNotes: validatedData.additionalNotes,
          // 구조화된 입력 저장
          executionPlan: validatedData.executionPlan ?? undefined,
          budgetPlan: validatedData.budgetPlan ?? undefined,
          expectedOutcomes: validatedData.expectedOutcomes ?? undefined,
        },
      });

      // Create reference plan relations if provided
      if (validatedData.referenceBusinessPlanIds?.length) {
        await tx.businessPlanReference.createMany({
          data: validatedData.referenceBusinessPlanIds.map((referencePlanId) => ({
            businessPlanId: plan.id,
            referencePlanId,
          })),
        });
      }

      // Grant owner permission
      await grant("business_plan", plan.id, "owner", "user", session.user.id);

      return plan;
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

    logger.error("Failed to create business plan", { error });
    return NextResponse.json(
      { error: "Failed to create business plan" },
      { status: 500 }
    );
  }
}
