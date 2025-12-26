/**
 * Evaluation Upload API (PRD 4.6)
 * POST /api/evaluations/upload - Upload & evaluate
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateBusinessPlan } from "@/lib/evaluation-engine";
import { parseDocument } from "@/lib/document-parser";
import { sendEvaluationCompleteNotification } from "@/lib/notifications";
import { uploadEvaluationFile } from "@/lib/supabase-storage";
import { createLogger } from "@/lib/logger";
import { z } from "zod";

const logger = createLogger({ api: "evaluations-upload" });

const uploadEvaluationSchema = z.object({
  criteria: z.string().min(1),
  fileUrl: z.string().url().optional(),
  projectId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const criteriaText = formData.get("criteria") as string;
    const projectId = formData.get("projectId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!criteriaText) {
      return NextResponse.json(
        { error: "Evaluation criteria is required" },
        { status: 400 }
      );
    }

    // Parse uploaded document using text_parser
    let parsedContent = "";
    try {
      let fileType: "hwp" | "hwpx" | "pdf";
      if (file.name.endsWith(".hwp")) {
        fileType = "hwp";
      } else if (file.name.endsWith(".hwpx")) {
        fileType = "hwpx";
      } else if (file.name.endsWith(".pdf")) {
        fileType = "pdf";
      } else {
        return NextResponse.json(
          { error: "Unsupported file format. Please upload HWP, HWPX, or PDF files." },
          { status: 400 }
        );
      }

      const parseResult = await parseDocument(file, fileType);
      parsedContent = parseResult.text;
    } catch (parseError) {
      logger.error("Document parse failed", { error: parseError, fileName: file.name });
      return NextResponse.json(
        { error: "Failed to parse document. Please check the file format." },
        { status: 400 }
      );
    }

    // Create evaluation record first to get the ID
    const evaluation = await prisma.evaluation.create({
      data: {
        userId: session.user.id,
        uploadedFileUrl: file.name, // Temporary - will update after upload
        criteria: criteriaText,
        status: "processing",
      },
    });

    // Upload file to Supabase Storage
    const uploadResult = await uploadEvaluationFile(
      file,
      evaluation.id,
      session.user.id
    );

    if (uploadResult.success && uploadResult.storagePath) {
      // Update evaluation with actual storage path
      await prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { uploadedFileUrl: uploadResult.storagePath },
      });
      logger.info("Evaluation file uploaded", {
        evaluationId: evaluation.id,
        storagePath: uploadResult.storagePath,
      });
    } else {
      logger.warn("File upload failed, using filename only", {
        evaluationId: evaluation.id,
        error: uploadResult.error,
      });
    }

    // Perform evaluation asynchronously
    performUploadEvaluation(evaluation.id, {
      uploadedContent: parsedContent,
      criteria: criteriaText,
    }).catch((error) => {
      logger.error("Upload evaluation background error", { error, evaluationId: evaluation.id });
    });

    return NextResponse.json({
      success: true,
      evaluation,
      message: "File uploaded. Evaluation started.",
    });
  } catch (error) {
    logger.error("Upload evaluation failed", { error });
    return NextResponse.json(
      { error: "Failed to upload and evaluate file" },
      { status: 500 }
    );
  }
}

/**
 * Background evaluation for uploaded files
 */
async function performUploadEvaluation(
  evaluationId: string,
  input: { uploadedContent: string; criteria: string }
) {
  try {
    // Run AI evaluation
    const result = await evaluateBusinessPlan({
      uploadedContent: input.uploadedContent,
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

    logger.info("Evaluation completed", { evaluationId, totalScore: result.totalScore });
  } catch (error) {
    logger.error("Upload background processing failed", { error, evaluationId });

    // Mark as failed
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: "failed",
      },
    });
  }
}
