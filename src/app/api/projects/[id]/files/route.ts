/**
 * API: GET /api/projects/[id]/files
 * 프로젝트 첨부파일 목록 조회 (서명된 URL 포함)
 *
 * 응답:
 * - files: 첨부파일 배열
 *   - id: 파일 ID
 *   - fileName: 원본 파일명
 *   - fileType: 파일 타입 (hwp, hwpx, pdf)
 *   - fileSize: 파일 크기 (bytes)
 *   - downloadUrl: 서명된 다운로드 URL (5분 유효)
 *   - isParsed: 파싱 완료 여부
 *   - createdAt: 생성일시
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 프로젝트 존재 여부 확인
    const project = await prisma.supportProject.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 첨부파일 목록 조회
    const attachments = await prisma.projectAttachment.findMany({
      where: { projectId },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        storagePath: true,
        sourceUrl: true,
        shouldParse: true,
        isParsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 다운로드 URL 결정
    // - storagePath가 있으면: Supabase 서명된 URL (5분 유효)
    // - storagePath가 없으면: 원본 sourceUrl 직접 사용
    const filesWithUrls = await Promise.all(
      attachments.map(async (attachment) => {
        let downloadUrl: string | null = null;
        let isStoredLocally = false;

        if (attachment.storagePath) {
          // 핵심 문서: Supabase Storage에 저장됨
          const signedUrlResult = await getSignedUrl(attachment.storagePath, 300);
          downloadUrl = signedUrlResult.success && signedUrlResult.signedUrl
            ? signedUrlResult.signedUrl
            : null;
          isStoredLocally = true;
        } else {
          // 일반 파일: 원본 URL로 직접 다운로드
          downloadUrl = attachment.sourceUrl;
          isStoredLocally = false;
        }

        return {
          id: attachment.id,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          fileSizeFormatted: attachment.fileSize > 0
            ? formatFileSize(attachment.fileSize)
            : "크기 미확인",
          downloadUrl,
          sourceUrl: attachment.sourceUrl,
          isStoredLocally, // 로컬 저장 여부 (Supabase vs 원본 URL)
          isParsed: attachment.isParsed,
          createdAt: attachment.createdAt.toISOString(),
        };
      })
    );

    return NextResponse.json({
      projectId,
      projectName: project.name,
      totalFiles: filesWithUrls.length,
      files: filesWithUrls,
    });
  } catch (error) {
    console.error("Error fetching project files:", error);
    return NextResponse.json(
      { error: "Failed to fetch project files" },
      { status: 500 }
    );
  }
}

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
