import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCompanyPermission } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import { z } from "zod"

const logger = createLogger({ api: "master-profile-block" })

const updateBlockSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  contentType: z.enum(["markdown", "table", "list", "keyvalue"]).optional(),
  metadata: z.record(z.any()).optional(),
  blockOrder: z.number().int().min(0).optional(),
})

interface RouteParams {
  params: Promise<{ id: string; blockId: string }>
}

/**
 * GET /api/companies/[id]/master-profile/blocks/[blockId]
 * 개별 블록 조회
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId, blockId } = await params

    // 권한 체크
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "viewer"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 블록 조회 (프로필 소속 확인 포함)
    const block = await prisma.profileBlock.findFirst({
      where: {
        id: blockId,
        profile: {
          companyId,
        },
      },
      include: {
        profile: {
          select: {
            id: true,
            companyId: true,
            status: true,
          },
        },
      },
    })

    if (!block) {
      return NextResponse.json({ error: "블록을 찾을 수 없습니다" }, { status: 404 })
    }

    return NextResponse.json(block)
  } catch (error) {
    logger.error("Failed to fetch block", { error })
    return NextResponse.json(
      { error: "블록을 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/companies/[id]/master-profile/blocks/[blockId]
 * 블록 수정
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId, blockId } = await params

    // 권한 체크 (admin+ 필요)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "admin"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 기존 블록 확인
    const existingBlock = await prisma.profileBlock.findFirst({
      where: {
        id: blockId,
        profile: {
          companyId,
        },
      },
    })

    if (!existingBlock) {
      return NextResponse.json({ error: "블록을 찾을 수 없습니다" }, { status: 404 })
    }

    const body = await req.json()
    const validatedData = updateBlockSchema.parse(body)

    // 블록 업데이트
    const updatedBlock = await prisma.profileBlock.update({
      where: { id: blockId },
      data: {
        ...validatedData,
        isEdited: true, // 수동 편집 표시
        updatedAt: new Date(),
      },
    })

    logger.info("Block updated", {
      blockId,
      companyId,
      userId: session.user.id,
    })

    return NextResponse.json(updatedBlock)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      )
    }

    logger.error("Failed to update block", { error })
    return NextResponse.json(
      { error: "블록 수정에 실패했습니다" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/companies/[id]/master-profile/blocks/[blockId]
 * 블록 삭제 (비활성화)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId, blockId } = await params

    // 권한 체크 (admin+ 필요)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "admin"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 기존 블록 확인
    const existingBlock = await prisma.profileBlock.findFirst({
      where: {
        id: blockId,
        profile: {
          companyId,
        },
      },
    })

    if (!existingBlock) {
      return NextResponse.json({ error: "블록을 찾을 수 없습니다" }, { status: 404 })
    }

    // 소프트 삭제 (비활성화)
    await prisma.profileBlock.update({
      where: { id: blockId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    })

    logger.info("Block deleted (soft)", {
      blockId,
      companyId,
      userId: session.user.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Failed to delete block", { error })
    return NextResponse.json(
      { error: "블록 삭제에 실패했습니다" },
      { status: 500 }
    )
  }
}
