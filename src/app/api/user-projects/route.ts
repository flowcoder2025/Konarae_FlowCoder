/**
 * 사용자 프로젝트 API
 * GET /api/user-projects - 프로젝트 목록 조회
 * POST /api/user-projects - 새 프로젝트 생성
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "user-projects" })

/**
 * GET /api/user-projects - 사용자의 프로젝트 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const companyId = searchParams.get("companyId") || undefined
    const status = searchParams.get("status") || undefined

    const skip = (page - 1) * limit

    const where = {
      userId: session.user.id,
      deletedAt: null,
      ...(companyId && { companyId }),
      ...(status && { status }),
    }

    const [userProjects, total] = await Promise.all([
      prisma.userProject.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              organization: true,
              category: true,
              deadline: true,
              status: true,
            },
          },
          matchingResult: {
            select: {
              id: true,
              totalScore: true,
              confidence: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.userProject.count({ where }),
    ])

    return NextResponse.json({
      data: userProjects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error("Failed to fetch user projects", { error })
    return NextResponse.json(
      { error: "프로젝트 목록 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user-projects - 새 프로젝트 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const body = await request.json()
    const { companyId, projectId, matchingResultId } = body

    if (!companyId || !projectId) {
      return NextResponse.json(
        { error: "companyId와 projectId가 필요합니다" },
        { status: 400 }
      )
    }

    // 사용자가 해당 기업의 멤버인지 확인
    const membership = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId: session.user.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "해당 기업에 대한 접근 권한이 없습니다" },
        { status: 403 }
      )
    }

    // 지원사업 존재 여부 확인
    const supportProject = await prisma.supportProject.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })

    if (!supportProject) {
      return NextResponse.json(
        { error: "지원사업을 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // 1. 활성 레코드 확인 (삭제되지 않은 프로젝트)
    const activeExisting = await prisma.userProject.findFirst({
      where: {
        userId: session.user.id,
        companyId,
        projectId,
        deletedAt: null,
      },
    })

    if (activeExisting) {
      return NextResponse.json(
        {
          error: "이미 등록된 프로젝트입니다",
          userProjectId: activeExisting.id
        },
        { status: 409 }
      )
    }

    // 2. 삭제된 레코드 확인 → 복구
    const deletedExisting = await prisma.userProject.findFirst({
      where: {
        userId: session.user.id,
        companyId,
        projectId,
        deletedAt: { not: null },
      },
    })

    if (deletedExisting) {
      // 삭제된 프로젝트 복구 (재활성화)
      const restoredProject = await prisma.userProject.update({
        where: { id: deletedExisting.id },
        data: {
          deletedAt: null,
          status: "exploring",
          currentStep: 1,
          matchingResultId: matchingResultId || deletedExisting.matchingResultId,
          updatedAt: new Date(),
        },
        include: {
          company: {
            select: { id: true, name: true },
          },
          project: {
            select: { id: true, name: true, organization: true },
          },
        },
      })

      logger.info("User project restored", {
        userProjectId: restoredProject.id,
        userId: session.user.id,
        projectId,
      })

      return NextResponse.json(restoredProject, { status: 201 })
    }

    // 3. 새 프로젝트 생성
    const userProject = await prisma.userProject.create({
      data: {
        userId: session.user.id,
        companyId,
        projectId,
        matchingResultId: matchingResultId || null,
        currentStep: 1,
        status: "exploring",
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
        project: {
          select: { id: true, name: true, organization: true },
        },
      },
    })

    logger.info("User project created", {
      userProjectId: userProject.id,
      userId: session.user.id,
      projectId,
    })

    return NextResponse.json(userProject, { status: 201 })
  } catch (error) {
    logger.error("Failed to create user project", { error })
    return NextResponse.json(
      { error: "프로젝트 생성 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
