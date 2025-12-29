import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCompanyPermission } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import type { MasterProfileWithBlocks } from "@/lib/master-profile/types"

const logger = createLogger({ api: "master-profile" })

/**
 * GET /api/companies/[id]/master-profile
 * 마스터 프로필 조회 (viewer+ 권한)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId } = await params

    // 권한 체크
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "viewer"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 프로필 조회 (블록 포함)
    const profile = await prisma.companyMasterProfile.findUnique({
      where: { companyId },
      include: {
        blocks: {
          where: { isActive: true },
          orderBy: [{ category: "asc" }, { blockOrder: "asc" }],
        },
      },
    })

    if (!profile) {
      // 프로필이 없으면 생성 가능 여부와 함께 반환
      const documents = await prisma.companyDocument.findMany({
        where: {
          companyId,
          status: "analyzed",
          deletedAt: null,
        },
        select: {
          id: true,
          documentType: true,
        },
      })

      return NextResponse.json({
        profile: null,
        canGenerate: documents.length >= 3,
        analyzedDocumentCount: documents.length,
        documentTypes: documents.map((d) => d.documentType),
      })
    }

    return NextResponse.json({
      profile: profile as MasterProfileWithBlocks,
      canGenerate: true,
      analyzedDocumentCount: profile.analyzedDocumentCount,
    })
  } catch (error) {
    logger.error("Failed to fetch master profile", { error })
    return NextResponse.json(
      { error: "마스터 프로필을 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/companies/[id]/master-profile
 * 마스터 프로필 메타데이터 수정 (admin+ 권한)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId } = await params

    // 권한 체크
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "admin"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    const body = await req.json()

    const profile = await prisma.companyMasterProfile.update({
      where: { companyId },
      data: {
        // 현재는 메타데이터만 수정 가능
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(profile)
  } catch (error) {
    logger.error("Failed to update master profile", { error })
    return NextResponse.json(
      { error: "마스터 프로필 수정에 실패했습니다" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/companies/[id]/master-profile
 * 마스터 프로필 삭제 (owner 권한)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId } = await params

    // 권한 체크 - owner만 삭제 가능
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "owner"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 프로필과 연관된 블록 모두 삭제 (Cascade)
    await prisma.companyMasterProfile.delete({
      where: { companyId },
    })

    return NextResponse.json({ message: "마스터 프로필이 삭제되었습니다" })
  } catch (error) {
    logger.error("Failed to delete master profile", { error })
    return NextResponse.json(
      { error: "마스터 프로필 삭제에 실패했습니다" },
      { status: 500 }
    )
  }
}
