import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { checkCompanyPermission } from "@/lib/rebac"
import { createLogger } from "@/lib/logger"
import {
  consumeCredit,
  refundCredit,
  getOrCreateCredit,
} from "@/lib/credits"
import {
  MASTER_PROFILE_GENERATION_COST,
  MIN_ANALYZED_DOCUMENTS,
  REQUIRED_DOCUMENT_GROUPS,
  MASTER_PROFILE_MESSAGES,
  calculateExpectedQuality,
} from "@/lib/master-profile/constants"
import type { GenerateMasterProfileResponse } from "@/lib/master-profile/types"
import { generateProfileBlocks } from "@/lib/master-profile/generate"

const logger = createLogger({ api: "master-profile-generate" })

/**
 * POST /api/companies/[id]/master-profile/generate
 * 마스터 프로필 생성 (첫 생성 무료, 이후 크레딧 차감)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<GenerateMasterProfileResponse>> {
  const { id: companyId } = await params

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다" },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // 권한 체크 (admin+ 필요)
    const hasPermission = await checkCompanyPermission(userId, companyId, "admin")
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "권한이 없습니다" },
        { status: 403 }
      )
    }

    // 기존 프로필 확인
    const existingProfile = await prisma.companyMasterProfile.findUnique({
      where: { companyId },
    })

    // 비용 결정 (첫 생성 무료)
    const isFirstGeneration = !existingProfile || existingProfile.isFreeGeneration
    const requiredCredit = isFirstGeneration ? 0 : MASTER_PROFILE_GENERATION_COST

    // 크레딧 확인 (첫 생성이 아닌 경우)
    if (!isFirstGeneration) {
      const creditInfo = await getOrCreateCredit(userId)
      if (creditInfo.balance < requiredCredit) {
        return NextResponse.json(
          {
            success: false,
            error: MASTER_PROFILE_MESSAGES.ERROR_INSUFFICIENT_CREDIT,
            requiredCredit,
          },
          { status: 402 }
        )
      }
    }

    // 분석된 문서 조회
    const analyzedDocuments = await prisma.companyDocument.findMany({
      where: {
        companyId,
        status: "analyzed",
        deletedAt: null,
      },
      include: {
        analysis: true,
      },
    })

    // 최소 문서 수 검증
    if (analyzedDocuments.length < MIN_ANALYZED_DOCUMENTS) {
      return NextResponse.json(
        {
          success: false,
          error: MASTER_PROFILE_MESSAGES.ERROR_INSUFFICIENT_DOCUMENTS,
        },
        { status: 400 }
      )
    }

    // 필수 문서 그룹 검증
    const documentTypes = analyzedDocuments.map((d) => d.documentType)
    for (const group of REQUIRED_DOCUMENT_GROUPS) {
      const hasRequired = group.some((type) => documentTypes.includes(type))
      if (!hasRequired) {
        return NextResponse.json(
          {
            success: false,
            error: MASTER_PROFILE_MESSAGES.ERROR_REQUIRED_DOCUMENTS,
          },
          { status: 400 }
        )
      }
    }

    // 회사 정보 조회 (AI 생성에 필요)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    })

    if (!company) {
      return NextResponse.json(
        { success: false, error: "기업을 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // 프로필 생성/업데이트 (상태: generating)
    const profile = await prisma.companyMasterProfile.upsert({
      where: { companyId },
      create: {
        companyId,
        status: "generating",
        isFreeGeneration: true,
        generatedFromDocuments: analyzedDocuments.map((d) => d.id),
        analyzedDocumentCount: analyzedDocuments.length,
      },
      update: {
        status: "generating",
        version: { increment: 1 },
        generatedFromDocuments: analyzedDocuments.map((d) => d.id),
        analyzedDocumentCount: analyzedDocuments.length,
        errorMessage: null,
      },
    })

    // 크레딧 차감 (첫 생성이 아닌 경우)
    let creditTransactionId: string | null = null
    if (!isFirstGeneration) {
      const creditResult = await consumeCredit({
        userId,
        amount: requiredCredit,
        description: `마스터 프로필 재생성 - ${company.name}`,
        relatedType: "master_profile",
        relatedId: profile.id,
      })

      if (!creditResult.success) {
        // 프로필 상태 롤백
        await prisma.companyMasterProfile.update({
          where: { id: profile.id },
          data: { status: existingProfile?.status || "draft" },
        })
        return NextResponse.json(
          { success: false, error: creditResult.error },
          { status: 402 }
        )
      }
      creditTransactionId = creditResult.transactionId
    }

    try {
      // AI 블록 생성
      const documentInputs = analyzedDocuments
        .filter((d) => d.analysis)
        .map((d) => ({
          documentId: d.id,
          documentType: d.documentType,
          extractedData: d.analysis!.extractedData,
          summary: d.analysis!.summary,
          keyInsights: d.analysis!.keyInsights,
        }))

      const generationResult = await generateProfileBlocks(documentInputs, company.name)

      // 기존 블록 비활성화 + 새 블록 생성 (트랜잭션)
      await prisma.$transaction(async (tx) => {
        // 기존 블록 비활성화
        await tx.profileBlock.updateMany({
          where: { profileId: profile.id },
          data: { isActive: false },
        })

        // 새 블록 생성
        if (generationResult.blocks.length > 0) {
          await tx.profileBlock.createMany({
            data: generationResult.blocks.map((block) => ({
              profileId: profile.id,
              category: block.category,
              title: block.title,
              blockOrder: block.blockOrder,
              content: block.content,
              contentType: block.contentType,
              metadata: block.metadata as unknown as Prisma.InputJsonValue,
              sourceDocumentIds: block.sourceDocumentIds,
              sourceDocumentTypes: block.sourceDocumentTypes,
              isAiGenerated: true,
            })),
          })
        }

        // 프로필 상태 업데이트
        await tx.companyMasterProfile.update({
          where: { id: profile.id },
          data: {
            status: "completed",
            isFreeGeneration: false, // 첫 생성 완료 표시
            creditUsed: isFirstGeneration ? 0 : requiredCredit,
            confidenceScore: generationResult.confidenceScore,
            completedAt: new Date(),
          },
        })
      })

      logger.info("Master profile generated successfully", {
        companyId,
        profileId: profile.id,
        blockCount: generationResult.blocks.length,
        isFirstGeneration,
      })

      return NextResponse.json({
        success: true,
        profileId: profile.id,
        isFirstGeneration,
      })
    } catch (generationError) {
      // AI 생성 실패 시 크레딧 환불
      if (creditTransactionId && !isFirstGeneration) {
        await refundCredit({
          userId,
          amount: requiredCredit,
          description: `마스터 프로필 생성 실패 환불 - ${company.name}`,
          relatedType: "master_profile",
          relatedId: profile.id,
        })
      }

      // 프로필 상태 실패로 업데이트
      await prisma.companyMasterProfile.update({
        where: { id: profile.id },
        data: {
          status: "failed",
          errorMessage:
            generationError instanceof Error
              ? generationError.message
              : "알 수 없는 오류",
        },
      })

      logger.error("Failed to generate profile blocks", {
        error: generationError,
        companyId,
        profileId: profile.id,
      })

      return NextResponse.json(
        {
          success: false,
          error: MASTER_PROFILE_MESSAGES.ERROR_GENERATION_FAILED,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    logger.error("Failed to generate master profile", { error, companyId })
    return NextResponse.json(
      {
        success: false,
        error: "마스터 프로필 생성에 실패했습니다",
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/companies/[id]/master-profile/generate
 * 생성 가능 여부 및 비용 정보 조회
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

    // 기존 프로필 확인
    const existingProfile = await prisma.companyMasterProfile.findUnique({
      where: { companyId },
      select: {
        id: true,
        status: true,
        isFreeGeneration: true,
        version: true,
      },
    })

    // 분석된 문서 조회
    const analyzedDocuments = await prisma.companyDocument.findMany({
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

    // 크레딧 잔액
    const creditInfo = await getOrCreateCredit(session.user.id)

    // 비용 계산
    const isFirstGeneration =
      !existingProfile || existingProfile.isFreeGeneration
    const requiredCredit = isFirstGeneration ? 0 : MASTER_PROFILE_GENERATION_COST

    // 필수 문서 검증
    const documentTypes = analyzedDocuments.map((d) => d.documentType)
    const missingRequiredGroups: string[][] = []
    for (const group of REQUIRED_DOCUMENT_GROUPS) {
      const hasRequired = group.some((type) => documentTypes.includes(type))
      if (!hasRequired) {
        missingRequiredGroups.push([...group])
      }
    }

    // 생성 가능 여부
    const canGenerate =
      analyzedDocuments.length >= MIN_ANALYZED_DOCUMENTS &&
      missingRequiredGroups.length === 0 &&
      (isFirstGeneration || creditInfo.balance >= requiredCredit)

    // 예상 품질 점수
    const expectedQuality = calculateExpectedQuality(documentTypes)

    return NextResponse.json({
      canGenerate,
      isFirstGeneration,
      requiredCredit,
      currentBalance: creditInfo.balance,
      analyzedDocumentCount: analyzedDocuments.length,
      minRequiredDocuments: MIN_ANALYZED_DOCUMENTS,
      documentTypes,
      missingRequiredGroups,
      expectedQuality,
      existingProfile: existingProfile
        ? {
            id: existingProfile.id,
            status: existingProfile.status,
            version: existingProfile.version,
          }
        : null,
      messages: {
        qualityTip: MASTER_PROFILE_MESSAGES.CTA_QUALITY_TIP,
        costInfo: isFirstGeneration
          ? MASTER_PROFILE_MESSAGES.MODAL_COST_FREE
          : MASTER_PROFILE_MESSAGES.MODAL_COST_CREDIT,
      },
    })
  } catch (error) {
    logger.error("Failed to get generation info", { error })
    return NextResponse.json(
      { error: "생성 정보를 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}
