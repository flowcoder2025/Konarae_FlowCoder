/**
 * 사용자 프로젝트 상세 API
 * GET /api/user-projects/[id] - 프로젝트 상세 조회
 * PATCH /api/user-projects/[id] - 프로젝트 업데이트 (단계 진행, 상태 변경)
 * DELETE /api/user-projects/[id] - 프로젝트 삭제 (소프트 삭제)
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import type { Prisma } from "@prisma/client"

const logger = createLogger({ api: "user-projects-detail" })

interface Context {
  params: Promise<{ id: string }>
}

// 유효한 상태 값
const VALID_STATUSES = [
  "exploring",
  "preparing",
  "writing",
  "verifying",
  "submitted",
  "closed",
] as const

// currentStep → status 자동 매핑
const STEP_TO_STATUS_MAP: Record<number, string> = {
  1: "exploring",
  2: "preparing",
  3: "writing",
  4: "verifying",
  5: "submitted",
}

/**
 * GET /api/user-projects/[id] - 프로젝트 상세 조회
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id } = await params

    const userProject = await prisma.userProject.findFirst({
      where: {
        id,
        userId: session.user.id,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            businessNumber: true,
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
            summary: true,
            eligibility: true,
            requiredDocuments: true,
            websiteUrl: true,
            detailUrl: true,
          },
        },
        matchingResult: {
          select: {
            id: true,
            totalScore: true,
            confidence: true,
            matchReasons: true,
          },
        },
        businessPlan: {
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
          },
        },
        diagnosis: {
          select: {
            id: true,
            fitScore: true,
            status: true,
            completedAt: true,
          },
        },
        evaluation: {
          select: {
            id: true,
            totalScore: true,
            status: true,
            completedAt: true,
          },
        },
      },
    })

    if (!userProject) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    return NextResponse.json(userProject)
  } catch (error) {
    logger.error("Failed to fetch user project detail", { error })
    return NextResponse.json(
      { error: "프로젝트 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/user-projects/[id] - 프로젝트 업데이트
 *
 * Body 옵션:
 * - currentStep: 현재 단계 (1-5)
 * - step1Completed ~ step5Completed: 단계별 완료 여부
 * - status: 프로젝트 상태
 * - businessPlanId: 연결할 사업계획서 ID
 * - diagnosisId: 연결할 진단 ID
 * - evaluationId: 연결할 평가 ID
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // 프로젝트 존재 및 소유권 확인
    const existing = await prisma.userProject.findFirst({
      where: {
        id,
        userId: session.user.id,
        deletedAt: null,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // 업데이트 데이터 구성 (Prisma 타입으로 타입 안전성 보장)
    const updateData: Prisma.UserProjectUpdateInput = {}

    // 단계 업데이트
    if (typeof body.currentStep === "number") {
      if (body.currentStep < 1 || body.currentStep > 5) {
        return NextResponse.json(
          { error: "currentStep은 1-5 사이여야 합니다" },
          { status: 400 }
        )
      }
      updateData.currentStep = body.currentStep

      // 명시적 status가 없으면 currentStep 기반으로 자동 동기화
      if (!body.status) {
        const mappedStatus = STEP_TO_STATUS_MAP[body.currentStep]
        if (mappedStatus) {
          updateData.status = mappedStatus
        }
      }
    }

    // 단계별 완료 상태 업데이트
    const stepFields = [
      "step1Completed",
      "step2Completed",
      "step3Completed",
      "step4Completed",
      "step5Completed",
    ] as const

    for (const field of stepFields) {
      if (typeof body[field] === "boolean") {
        updateData[field] = body[field]
      }
    }

    // 상태 업데이트
    if (body.status) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `유효하지 않은 상태입니다. 허용: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        )
      }
      updateData.status = body.status
    }

    // 숨기기 업데이트
    if (typeof body.isHidden === "boolean") {
      updateData.isHidden = body.isHidden
    }

    // 연결된 작업물 ID 업데이트 (Prisma relation 문법 사용)
    if (body.businessPlanId !== undefined) {
      updateData.businessPlan = body.businessPlanId
        ? { connect: { id: body.businessPlanId } }
        : { disconnect: true }
    }
    if (body.diagnosisId !== undefined) {
      updateData.diagnosis = body.diagnosisId
        ? { connect: { id: body.diagnosisId } }
        : { disconnect: true }
    }
    if (body.evaluationId !== undefined) {
      updateData.evaluation = body.evaluationId
        ? { connect: { id: body.evaluationId } }
        : { disconnect: true }
    }
    if (body.matchingResultId !== undefined) {
      updateData.matchingResult = body.matchingResultId
        ? { connect: { id: body.matchingResultId } }
        : { disconnect: true }
    }

    // 업데이트할 내용이 없는 경우
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "업데이트할 내용이 없습니다" },
        { status: 400 }
      )
    }

    // 프로젝트 업데이트
    const userProject = await prisma.userProject.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: { id: true, name: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    })

    logger.info("User project updated", {
      userProjectId: id,
      userId: session.user.id,
      updates: Object.keys(updateData),
    })

    return NextResponse.json(userProject)
  } catch (error) {
    logger.error("Failed to update user project", { error })
    return NextResponse.json(
      { error: "프로젝트 업데이트 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/user-projects/[id] - 프로젝트 소프트 삭제
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id } = await params

    // 프로젝트 존재 및 소유권 확인
    const existing = await prisma.userProject.findFirst({
      where: {
        id,
        userId: session.user.id,
        deletedAt: null,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // 소프트 삭제
    await prisma.userProject.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    logger.info("User project deleted", {
      userProjectId: id,
      userId: session.user.id,
    })

    return NextResponse.json({ success: true, message: "프로젝트가 삭제되었습니다" })
  } catch (error) {
    logger.error("Failed to delete user project", { error })
    return NextResponse.json(
      { error: "프로젝트 삭제 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
