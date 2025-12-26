/**
 * Matching Feedback API (PRD 4.4)
 * POST /api/matching/results/:id/feedback - Submit user feedback
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "matching-feedback" });

const feedbackSchema = z.object({
  isRelevant: z.boolean(),
  feedbackNote: z.string().optional(),
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
    const body = await req.json();
    const validatedData = feedbackSchema.parse(body);

    // Check ownership
    const result = await prisma.matchingResult.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // Update feedback
    const updated = await prisma.matchingResult.update({
      where: { id },
      data: {
        isRelevant: validatedData.isRelevant,
        feedbackNote: validatedData.feedbackNote,
      },
    });

    return NextResponse.json({
      success: true,
      result: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to submit feedback", { error });
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
