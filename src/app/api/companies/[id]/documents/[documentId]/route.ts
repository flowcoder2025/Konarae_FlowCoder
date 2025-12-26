/**
 * GET /api/companies/[id]/documents/[documentId]
 * 문서 상세 조회
 *
 * PATCH /api/companies/[id]/documents/[documentId]
 * 문서 수정 등록 (재분석)
 *
 * DELETE /api/companies/[id]/documents/[documentId]
 * 문서 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createSignedUrl,
  deleteFromStorage,
  uploadToStorage,
  getFileAsBase64,
} from "@/lib/documents/upload";
import { analyzeDocument } from "@/lib/documents/analyze";
import { processDocumentEmbeddings } from "@/lib/documents/embedding";
import { DocumentType } from "@/lib/documents/types";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "company-document-detail" });

// ============================================
// GET: 문서 상세 조회
// ============================================

export async function GET(
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

    // 권한 확인
    const membership = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId } },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 문서 조회 (분석 결과 포함)
    const document = await prisma.companyDocument.findUnique({
      where: { id: documentId },
      include: {
        analysis: true,
        uploader: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!document || document.deletedAt) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Signed URL 생성 (다운로드용)
    const signedUrlResult = await createSignedUrl(document.fileUrl);

    return NextResponse.json({
      ...document,
      downloadUrl: signedUrlResult.signedUrl,
    });
  } catch (error) {
    logger.error("Failed to fetch document", { error });
    return NextResponse.json(
      { error: "문서 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH: 문서 수정 등록 (재분석)
// ============================================

export async function PATCH(
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

    // 기존 문서 확인
    const existingDocument = await prisma.companyDocument.findUnique({
      where: { id: documentId },
    });

    if (!existingDocument || existingDocument.deletedAt) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // FormData 파싱
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "파일이 필요합니다." },
        { status: 400 }
      );
    }

    // 기존 파일 삭제
    await deleteFromStorage(existingDocument.fileUrl);

    // 새 파일 업로드
    const uploadResult = await uploadToStorage({
      userId,
      companyId,
      documentType: existingDocument.documentType as DocumentType,
      file,
    });

    if (!uploadResult.success || !uploadResult.filePath) {
      return NextResponse.json(
        { error: uploadResult.error || "파일 업로드 실패" },
        { status: 500 }
      );
    }

    // 문서 업데이트 (버전 증가)
    const updatedDocument = await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: uploadResult.fileUrl!,
        version: { increment: 1 },
        status: "uploaded",
        analyzedAt: null,
        errorMessage: null,
      },
    });

    // 기존 분석/임베딩 삭제
    await prisma.companyDocumentAnalysis.deleteMany({
      where: { documentId },
    });
    await prisma.companyDocumentEmbedding.deleteMany({
      where: { documentId },
    });

    // 재분석 트리거
    processDocumentAnalysis(
      documentId,
      file,
      existingDocument.documentType as DocumentType
    ).catch((err) => {
      logger.error("Analysis error", { error: err });
    });

    return NextResponse.json({
      documentId: updatedDocument.id,
      fileUrl: updatedDocument.fileUrl,
      status: updatedDocument.status,
      version: updatedDocument.version,
    });
  } catch (error) {
    logger.error("Failed to update document", { error });
    return NextResponse.json(
      { error: "문서 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: 문서 삭제
// ============================================

export async function DELETE(
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

    // Soft Delete
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    // Storage에서 파일 삭제 (선택)
    // await deleteFromStorage(document.fileUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete document", { error });
    return NextResponse.json(
      { error: "문서 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ============================================
// 비동기 분석 프로세스 (재사용)
// ============================================

async function processDocumentAnalysis(
  documentId: string,
  file: File,
  documentType: DocumentType
) {
  try {
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: { status: "analyzing" },
    });

    const fileBase64 = await getFileAsBase64(file);

    const analysisResult = await analyzeDocument(
      documentType,
      fileBase64,
      file.type
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

    await prisma.companyDocumentAnalysis.create({
      data: {
        documentId,
        extractedData: analysisResult.extractedData as any,
        summary: analysisResult.summary!,
        keyInsights: analysisResult.keyInsights!,
        confidenceScore: analysisResult.confidenceScore,
      },
    });

    const fullText = `${analysisResult.summary}\n\n${analysisResult.keyInsights?.join("\n")}`;

    await processDocumentEmbeddings(documentId, fullText, {
      documentType,
      documentId,
    });

    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "analyzed",
        analyzedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error("Document analysis failed", { error });

    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "분석 중 오류 발생",
      },
    });
  }
}
