/**
 * Evaluation Detail API (PRD 4.6)
 * GET /api/evaluations/:id - Get evaluation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "evaluation-detail" });

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

    const evaluation = await prisma.evaluation.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        businessPlan: {
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
          },
        },
        feedbacks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: "Evaluation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ evaluation });
  } catch (error) {
    logger.error("Failed to fetch evaluation", { error });
    return NextResponse.json(
      { error: "Failed to fetch evaluation" },
      { status: 500 }
    );
  }
}
