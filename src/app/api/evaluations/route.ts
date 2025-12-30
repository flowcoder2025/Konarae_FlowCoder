/**
 * Evaluations API (PRD 4.6)
 * GET /api/evaluations - List evaluations
 * POST /api/evaluations - Request evaluation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateBusinessPlan } from "@/lib/evaluation-engine";
import { sendEvaluationCompleteNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/cache";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "evaluations" });

const createEvaluationSchema = z.object({
  businessPlanId: z.string().min(1),
  criteria: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessPlanId = searchParams.get("businessPlanId");

    // Build where clause
    const where: any = {
      userId: session.user.id,
    };

    if (businessPlanId) {
      where.businessPlanId = businessPlanId;
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        businessPlan: {
          select: {
            id: true,
            title: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            feedbacks: true,
          },
        },
      },
    });

    return NextResponse.json({ evaluations });
  } catch (error) {
    logger.error("Failed to fetch evaluations", { error });
    return NextResponse.json(
      { error: "Failed to fetch evaluations" },
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

    // Rate limiting: AI 평가는 비용이 높으므로 분당 5회로 제한
    const rateLimitResult = await rateLimit(
      `ai-evaluation:${session.user.id}`,
      5,
      60
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Too many requests",
          message: "AI 평가 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
            ),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          },
        }
      );
    }

    const body = await req.json();
    const validatedData = createEvaluationSchema.parse(body);

    // Get business plan
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id: validatedData.businessPlanId },
      include: {
        project: true,
      },
    });

    if (!businessPlan) {
      return NextResponse.json(
        { error: "Business plan not found" },
        { status: 404 }
      );
    }

    // Determine criteria source
    let criteria = validatedData.criteria;
    if (!criteria && businessPlan.project?.evaluationCriteria) {
      criteria = businessPlan.project.evaluationCriteria;
    }

    if (!criteria) {
      return NextResponse.json(
        {
          error:
            "Evaluation criteria not found. Please provide criteria or select a project with evaluation criteria.",
        },
        { status: 400 }
      );
    }

    // Create evaluation record
    const evaluation = await prisma.evaluation.create({
      data: {
        userId: session.user.id,
        businessPlanId: validatedData.businessPlanId,
        criteria,
        status: "processing",
      },
    });

    // Perform evaluation asynchronously (in background)
    performEvaluation(evaluation.id, {
      businessPlanId: validatedData.businessPlanId,
      criteria,
    }).catch((error) => {
      logger.error("Evaluation background error", { error, evaluationId: evaluation.id });
    });

    return NextResponse.json({
      success: true,
      evaluation,
      message: "Evaluation started. Check back in a few moments.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to create evaluation", { error });
    return NextResponse.json(
      { error: "Failed to create evaluation" },
      { status: 500 }
    );
  }
}

/**
 * Background evaluation processing
 */
async function performEvaluation(
  evaluationId: string,
  input: { businessPlanId: string; criteria: string }
) {
  try {
    // Run AI evaluation
    const result = await evaluateBusinessPlan({
      businessPlanId: input.businessPlanId,
      criteria: input.criteria,
    });

    // Store feedbacks
    await prisma.evaluationFeedback.createMany({
      data: result.feedbacks.map((feedback) => ({
        evaluationId,
        criteriaName: feedback.criteriaName,
        score: feedback.score,
        feedback: feedback.feedback,
        suggestions: feedback.suggestions,
      })),
    });

    // Update evaluation status
    const evaluation = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: "completed",
        totalScore: result.totalScore,
        completedAt: new Date(),
      },
    });

    // Send notification
    await sendEvaluationCompleteNotification(
      evaluation.userId,
      evaluationId,
      result.totalScore
    );
  } catch (error) {
    logger.error("Evaluation background processing error", { error, evaluationId });

    // Mark as failed
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: "failed",
      },
    });
  }
}
