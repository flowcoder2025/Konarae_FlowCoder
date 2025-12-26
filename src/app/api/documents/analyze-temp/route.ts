/**
 * POST /api/documents/analyze-temp
 * 사업자등록증 임시 분석 (회사 생성 전)
 * 파일 업로드 즉시 Gemini Vision으로 OCR 분석
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeDocument } from "@/lib/documents/analyze";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "documents-analyze-temp" });

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. FormData에서 파일 가져오기
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "파일이 제공되지 않았습니다." },
        { status: 400 }
      );
    }

    // 3. 파일 타입 검증
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일만 가능합니다." },
        { status: 400 }
      );
    }

    // 4. 파일 크기 검증 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "파일 크기가 10MB를 초과했습니다." },
        { status: 400 }
      );
    }

    // 5. 파일을 Base64로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileBase64 = buffer.toString("base64");

    // 6. Gemini Vision으로 사업자등록증 분석
    const analysisResult = await analyzeDocument(
      "business_registration",
      fileBase64,
      file.type
    );

    if (!analysisResult.success || !analysisResult.extractedData) {
      return NextResponse.json(
        { error: analysisResult.error || "문서 분석에 실패했습니다." },
        { status: 500 }
      );
    }

    // 7. 추출된 정보 반환
    return NextResponse.json({
      success: true,
      data: analysisResult.extractedData,
      summary: analysisResult.summary,
      insights: analysisResult.keyInsights,
    });
  } catch (error) {
    logger.error("Analyze temp document error", { error });
    return NextResponse.json(
      { error: "문서 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
