/**
 * 제출 전 검증 시스템 - 메인 오케스트레이터
 * 사업계획서 제출 전 최종 점검
 */

import { prisma } from "@/lib/prisma"
import { consumeCredit, refundCredit } from "@/lib/credits"
import { createLogger } from "@/lib/logger"
import {
  VerificationResult,
  VerificationJobStatus,
  VERIFICATION_CREDIT_COST,
} from "@/types/verification"
import {
  verify,
  ProjectInfo,
  BusinessPlanInfo,
  AttachmentInfo,
  CompanyDocInfo,
} from "./verifier"

const logger = createLogger({ lib: "verification" })

export { verify } from "./verifier"

// ============================================
// 검증 실행
// ============================================

export interface RunVerificationParams {
  userId: string
  userProjectId: string
}

export interface RunVerificationResult {
  success: boolean
  verificationId?: string
  error?: string
}

/**
 * 제출 전 검증 실행 (전체 플로우)
 * 1. 크래딧 차감
 * 2. 검증 레코드 생성
 * 3. 데이터 조회 (프로젝트, 사업계획서, 첨부서류)
 * 4. 검증 수행
 * 5. 결과 저장
 */
export async function runVerification(
  params: RunVerificationParams
): Promise<RunVerificationResult> {
  const { userId, userProjectId } = params

  // 1. 크래딧 차감 (check = 제출 전 점검)
  const creditResult = await consumeCredit({
    userId,
    amount: VERIFICATION_CREDIT_COST,
    description: "제출 전 검증",
    relatedType: "check",
    relatedId: "",
  })

  if (!creditResult.success) {
    return {
      success: false,
      error: creditResult.error || "크래딧 차감 실패",
    }
  }

  // 2. 검증 레코드 생성
  const verification = await prisma.submissionVerification.create({
    data: {
      userProjectId,
      userId,
      status: "processing",
      creditUsed: VERIFICATION_CREDIT_COST,
    },
  })

  try {
    // 3. 데이터 조회
    const userProject = await prisma.userProject.findUnique({
      where: { id: userProjectId },
      include: {
        project: true,
        businessPlan: {
          include: {
            sections: true,
            attachments: true,
          },
        },
        company: {
          include: {
            documents: true,
          },
        },
      },
    })

    if (!userProject) {
      throw new Error("프로젝트를 찾을 수 없습니다.")
    }

    if (!userProject.project) {
      throw new Error("지원사업 정보를 찾을 수 없습니다.")
    }

    // 4. 검증 파라미터 구성
    const projectInfo: ProjectInfo = {
      name: userProject.project.name,
      agency: userProject.project.organization,
      deadline: userProject.project.deadline,
      requirements: userProject.project.eligibility,
    }

    let businessPlanInfo: BusinessPlanInfo | null = null
    if (userProject.businessPlan) {
      businessPlanInfo = {
        title: userProject.businessPlan.title || "사업계획서",
        pageCount: undefined, // 페이지 수는 별도 계산 필요
        sections: userProject.businessPlan.sections.map(
          (s: { title: string; sectionIndex: number }) => s.title
        ),
      }
    }

    // 사업계획서 첨부파일
    const attachments: AttachmentInfo[] = (
      userProject.businessPlan?.attachments || []
    ).map(
      (a: { fileName: string; fileType: string | null; fileSize: number }) => ({
        name: a.fileName,
        type: a.fileType || "unknown",
        size: a.fileSize || 0,
      })
    )

    // 기업 문서
    const companyDocuments: CompanyDocInfo[] = (
      userProject.company?.documents || []
    ).map(
      (d: {
        documentType: string
        fileName: string
        uploadedAt: Date
      }) => ({
        type: d.documentType,
        fileName: d.fileName,
        uploadedAt: d.uploadedAt,
      })
    )

    // 5. 검증 수행
    const result = await verify({
      project: projectInfo,
      businessPlan: businessPlanInfo,
      attachments,
      companyDocuments,
    })

    // 6. 결과 저장
    await prisma.submissionVerification.update({
      where: { id: verification.id },
      data: {
        status: "completed",
        result: result as unknown as object,
        completedAt: new Date(),
      },
    })

    return {
      success: true,
      verificationId: verification.id,
    }
  } catch (error) {
    logger.error("runVerification error", { error })

    // 검증 실패 시 상태 업데이트
    await prisma.submissionVerification.update({
      where: { id: verification.id },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      },
    })

    // 크래딧 환불
    await refundCredit({
      userId,
      amount: VERIFICATION_CREDIT_COST,
      description: "검증 실패로 인한 환불",
      relatedType: "check",
      relatedId: verification.id,
    })

    return {
      success: false,
      verificationId: verification.id,
      error: error instanceof Error ? error.message : "검증 중 오류 발생",
    }
  }
}

// ============================================
// 검증 결과 조회
// ============================================

export interface VerificationDetail {
  id: string
  userProjectId: string
  userId: string
  status: VerificationJobStatus
  result: VerificationResult | null
  creditUsed: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

/**
 * 검증 결과 상세 조회
 */
export async function getVerification(
  verificationId: string,
  userId: string
): Promise<VerificationDetail | null> {
  const verification = await prisma.submissionVerification.findFirst({
    where: {
      id: verificationId,
      userId,
    },
  })

  if (!verification) {
    return null
  }

  return {
    id: verification.id,
    userProjectId: verification.userProjectId,
    userId: verification.userId,
    status: verification.status as VerificationJobStatus,
    result: verification.result as VerificationResult | null,
    creditUsed: verification.creditUsed,
    errorMessage: verification.errorMessage,
    createdAt: verification.createdAt.toISOString(),
    completedAt: verification.completedAt?.toISOString() || null,
  }
}

/**
 * 사용자 프로젝트의 최신 검증 결과 조회
 */
export async function getLatestVerification(
  userProjectId: string,
  userId: string
): Promise<VerificationDetail | null> {
  const verification = await prisma.submissionVerification.findFirst({
    where: {
      userProjectId,
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  if (!verification) {
    return null
  }

  return {
    id: verification.id,
    userProjectId: verification.userProjectId,
    userId: verification.userId,
    status: verification.status as VerificationJobStatus,
    result: verification.result as VerificationResult | null,
    creditUsed: verification.creditUsed,
    errorMessage: verification.errorMessage,
    createdAt: verification.createdAt.toISOString(),
    completedAt: verification.completedAt?.toISOString() || null,
  }
}

/**
 * 사용자의 검증 목록 조회
 */
export async function getUserVerifications(
  userId: string,
  options?: {
    page?: number
    limit?: number
    userProjectId?: string
  }
) {
  const { page = 1, limit = 20, userProjectId } = options || {}

  const where = {
    userId,
    ...(userProjectId && { userProjectId }),
  }

  const [verifications, total] = await Promise.all([
    prisma.submissionVerification.findMany({
      where,
      include: {
        userProject: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.submissionVerification.count({ where }),
  ])

  return {
    verifications: verifications.map((v) => ({
      id: v.id,
      userProjectId: v.userProjectId,
      userId: v.userId,
      status: v.status as VerificationJobStatus,
      result: v.result as VerificationResult | null,
      creditUsed: v.creditUsed,
      errorMessage: v.errorMessage,
      createdAt: v.createdAt.toISOString(),
      completedAt: v.completedAt?.toISOString() || null,
      project: v.userProject.project,
    })),
    total,
    page,
    limit,
  }
}
