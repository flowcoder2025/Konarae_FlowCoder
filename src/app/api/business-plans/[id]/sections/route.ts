/**
 * Business Plan Sections API
 * GET /api/business-plans/:id/sections - List sections
 * POST /api/business-plans/:id/sections - Add new section (manual)
 * PUT /api/business-plans/:id/sections/reorder - Reorder sections
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "business-plan-sections" });

// 기본 템플릿 섹션 정의 (Route 파일에서는 export 불가)
const DEFAULT_SECTIONS = [
  { title: "기업 개요", description: "기업 소개, 연혁, 조직도" },
  { title: "사업 개요", description: "사업 목적, 필요성, 추진 배경" },
  { title: "수행 계획", description: "추진 일정, 세부 내용, 방법론" },
  { title: "수행 역량", description: "참여 인력, 전문성, 수행 실적" },
  { title: "사업 예산", description: "비용 산정, 자부담 계획" },
];

const addSectionSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  content: z.string().optional().default(""),
  sectionIndex: z.number().optional(), // 지정하지 않으면 마지막에 추가
});

const initializeTemplateSchema = z.object({
  mode: z.literal("template"),
});

// GET - List sections
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (viewer+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "viewer"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sections = await prisma.businessPlanSection.findMany({
      where: { businessPlanId: id },
      orderBy: { sectionIndex: "asc" },
    });

    return NextResponse.json({ sections });
  } catch (error) {
    logger.error("Failed to fetch sections", { error });
    return NextResponse.json(
      { error: "Failed to fetch sections" },
      { status: 500 }
    );
  }
}

// POST - Add new section or initialize template
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (editor+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "editor"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // 템플릿 초기화 모드 체크
    if (body.mode === "template") {
      // 기존 섹션이 있는지 확인
      const existingCount = await prisma.businessPlanSection.count({
        where: { businessPlanId: id },
      });

      if (existingCount > 0) {
        return NextResponse.json(
          { error: "이미 섹션이 존재합니다. 기존 섹션을 삭제한 후 템플릿을 초기화해주세요." },
          { status: 400 }
        );
      }

      // 기본 템플릿 섹션 생성
      const sections = await prisma.businessPlanSection.createMany({
        data: DEFAULT_SECTIONS.map((section, index) => ({
          businessPlanId: id,
          sectionIndex: index,
          title: section.title,
          content: `## ${section.title}\n\n${section.description}에 대한 내용을 작성해주세요.`,
          isAiGenerated: false,
        })),
      });

      // 상태 업데이트
      await prisma.businessPlan.update({
        where: { id },
        data: { status: "in_progress" },
      });

      return NextResponse.json({
        success: true,
        message: "템플릿이 초기화되었습니다",
        sectionsCount: sections.count,
      });
    }

    // 단일 섹션 추가 모드
    const validatedData = addSectionSchema.parse(body);

    // 현재 최대 sectionIndex 조회
    const maxIndexResult = await prisma.businessPlanSection.aggregate({
      where: { businessPlanId: id },
      _max: { sectionIndex: true },
    });

    const nextIndex = (maxIndexResult._max.sectionIndex ?? -1) + 1;
    const targetIndex = validatedData.sectionIndex ?? nextIndex;

    // 지정된 인덱스에 삽입하는 경우, 기존 섹션들의 인덱스 조정
    if (validatedData.sectionIndex !== undefined) {
      await prisma.businessPlanSection.updateMany({
        where: {
          businessPlanId: id,
          sectionIndex: { gte: targetIndex },
        },
        data: {
          sectionIndex: { increment: 1 },
        },
      });
    }

    const section = await prisma.businessPlanSection.create({
      data: {
        businessPlanId: id,
        sectionIndex: targetIndex,
        title: validatedData.title,
        content: validatedData.content || "",
        isAiGenerated: false,
      },
    });

    return NextResponse.json({
      success: true,
      section,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to add section", { error });
    return NextResponse.json(
      { error: "Failed to add section" },
      { status: 500 }
    );
  }
}
