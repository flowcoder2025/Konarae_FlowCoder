/**
 * Business Plan Single Section Generator API
 * POST /api/business-plans/:id/sections/generate
 *
 * 단일 섹션 생성 - 타임아웃 방지를 위해 섹션별 호출
 * 각 섹션은 30-60초 내에 생성되어 Vercel 타임아웃 회피
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { check } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import { generateSingleSection } from "@/lib/business-plan-generator"

const logger = createLogger({ api: "business-plan-section-generate" })

interface GenerateSectionRequest {
  sectionIndex: number
  title: string
  promptHint: string
  previousSectionsContent: string[] // 이전 섹션들의 내용 (컨텍스트 유지)
}

/**
 * POST /api/business-plans/:id/sections/generate
 * 단일 섹션 생성 (타임아웃 방지)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // 권한 확인
    const hasPermission = await check(session.user.id, "business_plan", id, "editor")
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 요청 바디 파싱
    const body = await req.json() as GenerateSectionRequest
    const { sectionIndex, title, promptHint, previousSectionsContent } = body

    if (!title || sectionIndex === undefined) {
      return NextResponse.json(
        { error: "sectionIndex and title are required" },
        { status: 400 }
      )
    }

    // 사업계획서 조회
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id },
      include: {
        company: {
          include: {
            financials: { orderBy: { fiscalYear: "desc" }, take: 3 },
            certifications: { where: { isActive: true } },
            achievements: { orderBy: { achievementDate: "desc" }, take: 5 },
          },
        },
        project: true,
      },
    })

    if (!businessPlan) {
      return NextResponse.json(
        { error: "Business plan not found" },
        { status: 404 }
      )
    }

    logger.info("Generating single section", {
      businessPlanId: id,
      sectionIndex,
      title,
    })

    // 단일 섹션 생성
    const content = await generateSingleSection({
      businessPlan,
      sectionIndex,
      title,
      promptHint,
      previousSectionsContent: previousSectionsContent || [],
    })

    logger.info("Section generated successfully", {
      businessPlanId: id,
      sectionIndex,
      contentLength: content.length,
    })

    return NextResponse.json({
      sectionIndex,
      title,
      content,
      isAiGenerated: true,
    })
  } catch (error) {
    logger.error("Failed to generate section", { error })
    return NextResponse.json(
      { error: "Failed to generate section" },
      { status: 500 }
    )
  }
}
