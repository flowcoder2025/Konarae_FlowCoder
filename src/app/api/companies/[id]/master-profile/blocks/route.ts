import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCompanyPermission } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import { z } from "zod"
import type { ProfileBlockCategory } from "@/lib/master-profile/types"

const logger = createLogger({ api: "master-profile-blocks" })

const createBlockSchema = z.object({
  category: z.string(),
  title: z.string().min(1),
  content: z.string(),
  contentType: z.enum(["markdown", "table", "list", "keyvalue"]).default("markdown"),
  metadata: z.record(z.any()).optional(),
})

/**
 * GET /api/companies/[id]/master-profile/blocks
 * 프로필 블록 목록 조회
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
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category") as ProfileBlockCategory | null

    // 권한 체크
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "viewer"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 프로필 존재 확인
    const profile = await prisma.companyMasterProfile.findUnique({
      where: { companyId },
      select: { id: true, status: true },
    })

    if (!profile) {
      return NextResponse.json({ error: "마스터 프로필이 없습니다" }, { status: 404 })
    }

    // 블록 조회
    const blocks = await prisma.profileBlock.findMany({
      where: {
        profileId: profile.id,
        isActive: true,
        ...(category && { category }),
      },
      orderBy: [{ category: "asc" }, { blockOrder: "asc" }],
    })

    // 카테고리별 그룹핑 옵션
    const groupByCategory = searchParams.get("groupByCategory") === "true"

    if (groupByCategory) {
      const grouped = blocks.reduce(
        (acc, block) => {
          if (!acc[block.category]) {
            acc[block.category] = []
          }
          acc[block.category].push(block)
          return acc
        },
        {} as Record<string, typeof blocks>
      )
      return NextResponse.json({ blocks: grouped, total: blocks.length })
    }

    return NextResponse.json({ blocks, total: blocks.length })
  } catch (error) {
    logger.error("Failed to fetch blocks", { error })
    return NextResponse.json(
      { error: "블록을 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/companies/[id]/master-profile/blocks
 * 수동으로 블록 추가
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id: companyId } = await params

    // 권한 체크 (admin+ 필요)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "admin"
    )
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 프로필 존재 확인
    const profile = await prisma.companyMasterProfile.findUnique({
      where: { companyId },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json({ error: "마스터 프로필이 없습니다" }, { status: 404 })
    }

    const body = await req.json()
    const validatedData = createBlockSchema.parse(body)

    // 같은 카테고리의 최대 blockOrder 조회
    const maxOrderBlock = await prisma.profileBlock.findFirst({
      where: {
        profileId: profile.id,
        category: validatedData.category,
        isActive: true,
      },
      orderBy: { blockOrder: "desc" },
      select: { blockOrder: true },
    })

    const newBlockOrder = (maxOrderBlock?.blockOrder ?? -1) + 1

    // 블록 생성
    const block = await prisma.profileBlock.create({
      data: {
        profileId: profile.id,
        category: validatedData.category,
        title: validatedData.title,
        blockOrder: newBlockOrder,
        content: validatedData.content,
        contentType: validatedData.contentType,
        metadata: validatedData.metadata || {},
        isAiGenerated: false, // 수동 생성
        sourceDocumentIds: [],
        sourceDocumentTypes: [],
      },
    })

    return NextResponse.json(block, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      )
    }

    logger.error("Failed to create block", { error })
    return NextResponse.json(
      { error: "블록 생성에 실패했습니다" },
      { status: 500 }
    )
  }
}
