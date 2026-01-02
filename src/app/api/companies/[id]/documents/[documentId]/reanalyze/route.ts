/**
 * POST /api/companies/[id]/documents/[documentId]/reanalyze
 * 문서 재분석 트리거
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeDocument } from "@/lib/documents/analyze";
import { processDocumentEmbeddings } from "@/lib/documents/embedding";
import { getStorageFileAsBase64FromUrl } from "@/lib/documents/upload";
import { DocumentType } from "@/lib/documents/types";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "company-document-reanalyze" });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId, documentId } = await params;
    const userId = session.user.id;

    // 권한 확인 (admin 이상)
    const membership = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId } },
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 문서 확인
    const document = await prisma.companyDocument.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 이미 분석 완료된 경우
    if (document.status === "analyzed") {
      return NextResponse.json(
        { error: "이미 분석이 완료된 문서입니다." },
        { status: 400 }
      );
    }

    // 이미 분석 중인 경우
    if (document.status === "analyzing") {
      return NextResponse.json(
        { error: "분석이 진행 중입니다. 잠시 후 다시 시도해주세요." },
        { status: 400 }
      );
    }

    // 상태를 analyzing으로 업데이트
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "analyzing",
        errorMessage: null,
      },
    });

    // 비동기로 분석 시작
    processDocumentReanalysis(
      documentId,
      document.fileUrl,
      document.mimeType,
      document.documentType as DocumentType
    ).catch((err) => {
      logger.error("Reanalysis error", { error: err, documentId });
    });

    return NextResponse.json({
      success: true,
      message: "재분석을 시작합니다.",
    });
  } catch (error) {
    logger.error("Failed to trigger reanalysis", { error });
    return NextResponse.json(
      { error: "재분석 요청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

async function processDocumentReanalysis(
  documentId: string,
  fileUrl: string,
  mimeType: string,
  documentType: DocumentType
) {
  try {
    // 파일을 Base64로 가져오기
    const fileBase64 = await getStorageFileAsBase64FromUrl(fileUrl);

    if (!fileBase64) {
      throw new Error("파일을 가져올 수 없습니다.");
    }

    // 분석 실행
    const analysisResult = await analyzeDocument(
      documentType,
      fileBase64,
      mimeType
    );

    if (!analysisResult.success) {
      await prisma.companyDocument.update({
        where: { id: documentId },
        data: {
          status: "failed",
          errorMessage: analysisResult.error,
        },
      });
      return;
    }

    // 기존 분석/임베딩 삭제
    await prisma.companyDocumentAnalysis.deleteMany({
      where: { documentId },
    });
    await prisma.companyDocumentEmbedding.deleteMany({
      where: { documentId },
    });

    // 새 분석 결과 저장
    await prisma.companyDocumentAnalysis.create({
      data: {
        documentId,
        extractedData: analysisResult.extractedData as any,
        summary: analysisResult.summary!,
        keyInsights: analysisResult.keyInsights!,
        confidenceScore: analysisResult.confidenceScore,
      },
    });

    // 임베딩 생성
    const fullText = `${analysisResult.summary}\n\n${analysisResult.keyInsights?.join("\n")}`;

    await processDocumentEmbeddings(documentId, fullText, {
      documentType,
      documentId,
    });

    // 상태 업데이트
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "analyzed",
        analyzedAt: new Date(),
        errorMessage: null,
      },
    });

    logger.info("Document reanalysis completed", { documentId });
  } catch (error) {
    logger.error("Document reanalysis failed", { error, documentId });

    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "재분석 중 오류 발생",
      },
    });
  }
}
