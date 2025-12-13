/**
 * GET /api/companies/[id]/documents
 * 회사의 문서 목록 조회
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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

    // 2. 회사 권한 확인 (최소 viewer 이상)
    const membership = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. 쿼리 파라미터
    const { searchParams } = new URL(req.url);
    const documentType = searchParams.get("documentType");
    const status = searchParams.get("status");

    // 4. 문서 목록 조회
    const documents = await prisma.companyDocument.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(documentType && { documentType }),
        ...(status && { status }),
      },
      orderBy: {
        uploadedAt: "desc",
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        fileSize: true,
        status: true,
        uploadedAt: true,
        analyzedAt: true,
        version: true,
        uploader: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[GET /documents] Error:", error);
    return NextResponse.json(
      { error: "문서 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
