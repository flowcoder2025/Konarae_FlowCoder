/**
 * POST /api/documents/analyze-job
 * QStash에서 호출되는 문서 분석 워커 엔드포인트
 *
 * 이 엔드포인트는 QStash 큐에서 순차적으로 호출되어
 * 연결 풀 고갈 없이 문서 분석을 처리합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyQStashSignature, type DocumentAnalysisJobPayload } from "@/lib/qstash";
import { getStorageFileAsBase64 } from "@/lib/documents/upload";
import { analyzeDocument } from "@/lib/documents/analyze";
import { processDocumentEmbeddings } from "@/lib/documents/embedding";
import { DocumentType } from "@/lib/documents/types";

// QStash 타임아웃 설정 (최대 5분)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // 1. QStash 서명 검증 (프로덕션에서만)
    if (process.env.NODE_ENV === "production") {
      const signature = req.headers.get("upstash-signature");
      const body = await req.text();

      const isValid = await verifyQStashSignature(signature, body);
      if (!isValid) {
        console.error("[analyze-job] Invalid QStash signature");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // body를 다시 파싱
      const payload: DocumentAnalysisJobPayload = JSON.parse(body);
      return await processAnalysis(payload);
    }

    // 개발 환경에서는 서명 없이 처리
    const payload: DocumentAnalysisJobPayload = await req.json();
    return await processAnalysis(payload);
  } catch (error) {
    console.error("[analyze-job] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

async function processAnalysis(payload: DocumentAnalysisJobPayload) {
  const { documentId, filePath, documentType, mimeType } = payload;

  console.log(`[analyze-job] Starting analysis for document: ${documentId}`);

  try {
    // 1. 상태 업데이트: analyzing
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: { status: "analyzing" },
    });

    // 2. Supabase Storage에서 파일 다운로드 → Base64 변환
    const fileBase64 = await getStorageFileAsBase64(filePath);

    if (!fileBase64) {
      throw new Error("파일을 Base64로 변환하는데 실패했습니다.");
    }

    // 3. Gemini Vision 분석
    const analysisResult = await analyzeDocument(
      documentType as DocumentType,
      fileBase64,
      mimeType
    );

    if (!analysisResult.success) {
      // 분석 실패
      await prisma.companyDocument.update({
        where: { id: documentId },
        data: {
          status: "failed",
          errorMessage: analysisResult.error,
        },
      });
      return NextResponse.json({
        success: false,
        error: analysisResult.error,
      });
    }

    // 4. 분석 결과 저장 + 상태 업데이트 (트랜잭션)
    await prisma.$transaction([
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
    ]);

    // 5. 임베딩 생성 및 저장 (non-fatal)
    const fullText = `${analysisResult.summary}\n\n${analysisResult.keyInsights?.join("\n")}`;

    try {
      await processDocumentEmbeddings(documentId, fullText, {
        documentType,
        documentId,
      });
    } catch (embeddingError) {
      console.error("[analyze-job] Embedding error (non-fatal):", embeddingError);
    }

    console.log(`[analyze-job] Analysis completed for document: ${documentId}`);

    return NextResponse.json({
      success: true,
      documentId,
      status: "analyzed",
    });
  } catch (error) {
    console.error(`[analyze-job] Analysis failed for document: ${documentId}`, error);

    // 상태 업데이트: failed
    try {
      await prisma.companyDocument.update({
        where: { id: documentId },
        data: {
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "분석 중 오류가 발생했습니다.",
        },
      });
    } catch (updateError) {
      console.error("[analyze-job] Failed to update error status:", updateError);
    }

    // QStash 재시도를 위해 500 에러 반환
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
