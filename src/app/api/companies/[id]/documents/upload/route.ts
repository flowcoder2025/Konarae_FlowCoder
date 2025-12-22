/**
 * POST /api/companies/[id]/documents/upload
 * 문서 업로드 API
 *
 * QStash가 설정되어 있으면 분석 작업을 큐에 넣고 즉시 응답합니다.
 * 이를 통해 동시 다중 업로드 시에도 연결 풀 고갈을 방지합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { uploadToStorage, getStorageFileAsBase64 } from "@/lib/documents/upload";
import { analyzeDocument } from "@/lib/documents/analyze";
import { processDocumentEmbeddings } from "@/lib/documents/embedding";
import { DocumentType } from "@/lib/documents/types";
import { isQStashConfigured, queueDocumentAnalysis } from "@/lib/qstash";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await params;
    const userId = session.user.id;

    // 2. 회사 권한 확인 (ReBAC - 최소 member 이상)
    const hasPermission = await checkCompanyPermission(
      userId,
      companyId,
      "member"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. FormData 파싱
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const documentType = formData.get("documentType") as DocumentType;

    if (!file || !documentType) {
      return NextResponse.json(
        { error: "파일과 문서 유형은 필수입니다." },
        { status: 400 }
      );
    }

    // 4. 파일 업로드 (Supabase Storage)
    const uploadResult = await uploadToStorage({
      userId,
      companyId,
      documentType,
      file,
    });

    if (!uploadResult.success || !uploadResult.filePath) {
      return NextResponse.json(
        { error: uploadResult.error || "파일 업로드 실패" },
        { status: 500 }
      );
    }

    // 5. DB 레코드 생성
    // QStash 사용 시 pending, 아니면 uploaded
    const initialStatus = isQStashConfigured ? "pending" : "uploaded";

    const document = await prisma.companyDocument.create({
      data: {
        companyId,
        documentType,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: uploadResult.fileUrl!,
        uploadedBy: userId,
        status: initialStatus,
      },
    });

    // 6. 분석 트리거
    if (isQStashConfigured) {
      // QStash 사용: 큐에 작업 추가 후 즉시 응답
      // 동시 100명이 업로드해도 연결 풀 고갈 없음
      const queueResult = await queueDocumentAnalysis({
        documentId: document.id,
        filePath: uploadResult.filePath!,
        documentType,
        mimeType: file.type,
      });

      if (!queueResult.success) {
        console.error("[POST /documents/upload] QStash queue failed:", queueResult.error);
        // 큐잉 실패 시 Fallback: 인라인 처리
        processDocumentAnalysis(document.id, uploadResult.filePath!, documentType, file.type).catch((err) => {
          console.error("[POST /documents/upload] Fallback analysis error:", err);
        });
      }
    } else {
      // QStash 미설정: 기존 인라인 처리 (연결 풀 이슈 가능)
      processDocumentAnalysis(document.id, uploadResult.filePath!, documentType, file.type).catch((err) => {
        console.error("[POST /documents/upload] Analysis error:", err);
      });
    }

    return NextResponse.json({
      documentId: document.id,
      fileUrl: document.fileUrl,
      status: document.status,
    });
  } catch (error) {
    console.error("[POST /documents/upload] Error:", error);
    return NextResponse.json(
      { error: "문서 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ============================================
// 재시도 유틸리티
// ============================================

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // P2024: Connection pool timeout - 재시도 가치 있음
      const isRetryable =
        lastError.message.includes("connection pool") ||
        lastError.message.includes("P2024") ||
        lastError.message.includes("timed out");

      if (!isRetryable || attempt === retries) {
        throw lastError;
      }

      const waitTime = delay * Math.pow(backoff, attempt);
      console.log(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

// ============================================
// 비동기 분석 프로세스
// ============================================

async function processDocumentAnalysis(
  documentId: string,
  filePath: string,
  documentType: DocumentType,
  mimeType: string
) {
  try {
    // 1. 상태 업데이트: analyzing (재시도 적용)
    await withRetry(() =>
      prisma.companyDocument.update({
        where: { id: documentId },
        data: { status: "analyzing" },
      })
    );

    // 2. Supabase Storage에서 파일 다운로드 → Base64 변환
    const fileBase64 = await getStorageFileAsBase64(filePath);

    if (!fileBase64) {
      throw new Error("파일을 Base64로 변환하는데 실패했습니다.");
    }

    // 3. Gemini Vision 분석
    const analysisResult = await analyzeDocument(
      documentType,
      fileBase64,
      mimeType
    );

    if (!analysisResult.success) {
      // 분석 실패 (재시도 적용)
      await withRetry(() =>
        prisma.companyDocument.update({
          where: { id: documentId },
          data: {
            status: "failed",
            errorMessage: analysisResult.error,
          },
        })
      );
      return;
    }

    // 4. 분석 결과 저장 + 상태 업데이트 (트랜잭션으로 묶어서 연결 효율화)
    await withRetry(() =>
      prisma.$transaction([
        prisma.companyDocumentAnalysis.create({
          data: {
            documentId,
            extractedData: analysisResult.extractedData as any,
            summary: analysisResult.summary!,
            keyInsights: analysisResult.keyInsights!,
            confidenceScore: analysisResult.confidenceScore,
          },
        }),
        prisma.companyDocument.update({
          where: { id: documentId },
          data: {
            status: "analyzed",
            analyzedAt: new Date(),
          },
        }),
      ])
    );

    // 5. 임베딩 생성 및 저장 (분석 완료 후 별도 처리)
    const fullText = `${analysisResult.summary}\n\n${analysisResult.keyInsights?.join("\n")}`;

    try {
      await processDocumentEmbeddings(documentId, fullText, {
        documentType,
        documentId,
      });
    } catch (embeddingError) {
      // 임베딩 실패는 치명적이지 않음 - 로그만 남김
      console.error("[processDocumentAnalysis] Embedding error (non-fatal):", embeddingError);
    }
  } catch (error) {
    console.error("[processDocumentAnalysis] Error:", error);

    // 상태 업데이트: failed (재시도 적용)
    try {
      await withRetry(() =>
        prisma.companyDocument.update({
          where: { id: documentId },
          data: {
            status: "failed",
            errorMessage:
              error instanceof Error
                ? error.message
                : "분석 중 오류가 발생했습니다.",
          },
        })
      );
    } catch (updateError) {
      // 실패 상태 업데이트도 실패하면 로그만 남김
      console.error("[processDocumentAnalysis] Failed to update error status:", updateError);
    }
  }
}
