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

/**
 * FormData 필드 검증 스키마
 */
const formDataSchema = z.object({
  criteria: z
    .string()
    .min(1, "평가 기준은 필수입니다")
    .max(10000, "평가 기준이 너무 깁니다 (최대 10,000자)"),
  projectId: z.string().cuid().optional().nullable(),
});

/**
 * 파일 검증: 허용된 확장자 및 크기
 */
const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".pdf"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateUploadFile(file: File): { valid: boolean; error?: string } {
  // 파일 크기 검증
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `파일 크기가 50MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  // 파일 확장자 검증
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `지원하지 않는 파일 형식입니다. HWP, HWPX, PDF 파일만 업로드 가능합니다.`,
    };
  }

  // 파일명 길이 검증 (경로 traversal 방지)
  if (file.name.length > 255) {
    return {
      valid: false,
      error: "파일명이 너무 깁니다 (최대 255자)",
    };
  }

  // 위험한 문자 검증
  const dangerousChars = /[<>:"|?*\x00-\x1f\\]/;
  if (dangerousChars.test(file.name)) {
    return {
      valid: false,
      error: "파일명에 허용되지 않는 문자가 포함되어 있습니다",
    };
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const criteriaRaw = formData.get("criteria");
    const projectIdRaw = formData.get("projectId");

    // 파일 타입 검증
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "File is required and must be a valid file" },
        { status: 400 }
      );
    }

    // FormData 필드 Zod 검증
    const formDataResult = formDataSchema.safeParse({
      criteria: criteriaRaw,
      projectId: projectIdRaw || null,
    });

    if (!formDataResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: formDataResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { criteria: criteriaText } = formDataResult.data;

    // 파일 검증
    const fileValidation = validateUploadFile(file);
    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: fileValidation.error },
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
