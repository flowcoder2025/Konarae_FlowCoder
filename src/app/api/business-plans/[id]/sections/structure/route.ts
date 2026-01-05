/**
 * Business Plan Section Structure API
 * GET /api/business-plans/:id/sections/structure
 *
 * 섹션 구조 추출 - 타임아웃 방지를 위해 분리
 * 프론트엔드에서 이 API를 먼저 호출하여 섹션 목록을 받은 후
 * 각 섹션을 개별적으로 생성 요청
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { check } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"

const logger = createLogger({ api: "business-plan-sections-structure" })

// 기본 섹션 템플릿
const DEFAULT_SECTIONS = [
  { title: "사업 개요", promptHint: "사업의 배경, 목적, 필요성을 명확하게 설명" },
  { title: "기업 현황", promptHint: "기업의 강점과 경쟁력을 강조" },
  { title: "사업 내용", promptHint: "구체적인 내용, 핵심 기술, 목표 시장" },
  { title: "추진 계획", promptHint: "단계별 일정, 마일스톤, 인력/예산 계획" },
  { title: "기대 효과", promptHint: "경제적, 기술적, 사회적 효과와 수치" },
]

interface FormSection {
  title: string
  promptHint: string
}

/**
 * GET /api/business-plans/:id/sections/structure
 * 섹션 구조 추출 (폼 분석 기반)
 */
export async function GET(
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

    // 사업계획서 조회
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id },
      select: { projectId: true },
    })

    if (!businessPlan || !businessPlan.projectId) {
      return NextResponse.json(
        { error: "Business plan or project not found" },
        { status: 404 }
      )
    }

    // 섹션 구조 추출
    const sections = await extractFormStructure(businessPlan.projectId)

    logger.info("Section structure extracted", {
      businessPlanId: id,
      sectionCount: sections.length,
    })

    return NextResponse.json({
      sections,
      totalCount: sections.length,
    })
  } catch (error) {
    logger.error("Failed to extract section structure", { error })
    return NextResponse.json(
      { error: "Failed to extract section structure" },
      { status: 500 }
    )
  }
}

/**
 * 프로젝트 첨부파일에서 폼 구조 추출
 */
async function extractFormStructure(projectId: string): Promise<FormSection[]> {
  try {
    // 폼 관련 첨부파일 조회
    const attachments = await prisma.projectAttachment.findMany({
      where: {
        projectId,
        isParsed: true,
        parsedContent: { not: null },
      },
    })

    // 양식 파일 필터링
    const formKeywords = ["신청서", "양식", "사업계획서", "작성서식", "서식", "공고문", "공고"]
    const formAttachments = attachments.filter((a) =>
      formKeywords.some((keyword) => a.fileName.includes(keyword))
    )

    if (formAttachments.length === 0) {
      logger.info("No form attachments found, using default sections")
      return DEFAULT_SECTIONS
    }

    const formContent = formAttachments[0].parsedContent
    if (!formContent) {
      return DEFAULT_SECTIONS
    }

    // Gemini로 섹션 구조 추출
    const { text } = await generateText({
      model: google("gemini-3-flash-preview"),
      system: `정부 지원사업 신청서 양식에서 작성 섹션을 추출하세요.

규칙:
1. 작성이 필요한 섹션만 (안내문, 표지, 서약서 제외)
2. title: 섹션 제목 (20자 이내)
3. promptHint: 작성 힌트 (30자 이내, 간결하게)
4. 최대 10개 섹션만

JSON 배열만 출력 (설명 없이):
[{"title":"제목","promptHint":"힌트"}]`,
      prompt: `양식에서 섹션 추출:\n\n${formContent.slice(0, 5000)}`,
      maxOutputTokens: 2000,
    })

    // AI 응답 파싱
    try {
      let jsonStr = text.trim()

      // 마크다운 코드 블록 제거
      if (jsonStr.includes("```")) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (match) {
          jsonStr = match[1].trim()
        } else {
          jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\s*$/g, "").trim()
        }
      }

      // JSON 배열 추출
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }

      const sections = JSON.parse(jsonStr) as FormSection[]

      if (Array.isArray(sections) && sections.length > 0) {
        logger.info(`Extracted ${sections.length} sections from form`)
        return sections
      }
    } catch (parseError) {
      logger.error("Failed to parse AI response", { error: parseError })
    }

    return DEFAULT_SECTIONS
  } catch (error) {
    logger.error("Extract form structure error", { error })
    return DEFAULT_SECTIONS
  }
}
