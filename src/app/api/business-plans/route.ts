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

const createBusinessPlanSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  title: z.string().min(1),
  newBusinessDescription: z.string().optional(),
  additionalNotes: z.string().optional(),
  referenceBusinessPlanIds: z.array(z.string()).optional(),
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
    console.error("[API] Get business plans error:", error);
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

    console.error("[API] Create business plan error:", error);
    return NextResponse.json(
      { error: "Failed to create business plan" },
      { status: 500 }
    );
  }
}
