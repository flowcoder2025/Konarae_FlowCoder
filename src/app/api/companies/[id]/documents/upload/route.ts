/**
 * POST /api/companies/[id]/documents/upload
 * 문서 업로드 API
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getFileAsBase64 } from "@/lib/documents/upload";
import { analyzeDocument } from "@/lib/documents/analyze";
import { processDocumentEmbeddings } from "@/lib/documents/embedding";
import { DocumentType } from "@/lib/documents/types";

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

    // 2. 회사 권한 확인 (최소 member 이상)
    const membership = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
    });

    if (!membership || membership.role === "viewer") {
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

    // 5. DB 레코드 생성 (status: uploaded)
    const document = await prisma.companyDocument.create({
      data: {
        companyId,
        documentType,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: uploadResult.fileUrl!,
        uploadedBy: userId,
        status: "uploaded",
      },
    });

    // 6. 비동기 분석 트리거 (백그라운드)
    // 실제 환경에서는 QStash나 Railway Worker 사용
    // 여기서는 즉시 분석 (간단한 구현)
    processDocumentAnalysis(document.id, file, documentType).catch((err) => {
      console.error("[POST /documents/upload] Analysis error:", err);
    });

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
// 비동기 분석 프로세스
// ============================================

async function processDocumentAnalysis(
  documentId: string,
  file: File,
  documentType: DocumentType
) {
  try {
    // 1. 상태 업데이트: analyzing
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: { status: "analyzing" },
    });

    // 2. 파일 → Base64 변환
    const fileBase64 = await getFileAsBase64(file);

    // 3. Gemini Vision 분석
    const analysisResult = await analyzeDocument(
      documentType,
      fileBase64,
      file.type
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
      return;
    }

    // 4. 분석 결과 저장
    await prisma.companyDocumentAnalysis.create({
      data: {
        documentId,
        extractedData: analysisResult.extractedData as any,
        summary: analysisResult.summary!,
        keyInsights: analysisResult.keyInsights!,
        confidenceScore: analysisResult.confidenceScore,
      },
    });

    // 5. 임베딩 생성 및 저장
    const fullText = `${analysisResult.summary}\n\n${analysisResult.keyInsights?.join("\n")}`;

    await processDocumentEmbeddings(documentId, fullText, {
      documentType,
      documentId,
    });

    // 6. 상태 업데이트: analyzed
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        status: "analyzed",
        analyzedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[processDocumentAnalysis] Error:", error);

    // 상태 업데이트: failed
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
  }
}
