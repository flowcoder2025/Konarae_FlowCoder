/**
 * 부족항목 진단 시스템 - 메인 오케스트레이터
 * @see /docs/gap-diagnosis-plan.md
 */

import { prisma } from "@/lib/prisma"
import { consumeCredit, refundCredit } from "@/lib/credits"
import {
  DiagnosisStatus,
  ExtractedRequirement,
  GapItem,
  ActionItem,
  CREDIT_COSTS,
} from "@/types/diagnosis"
import { extractRequirements, ProjectInfo } from "./requirements"
import { analyzeGaps, CompanyInfo, CompanyDocument, RagContext } from "./gap-analyzer"

export { extractRequirements } from "./requirements"
export { analyzeGaps } from "./gap-analyzer"

// ============================================
// 진단 실행
// ============================================

export interface RunDiagnosisParams {
  userId: string
  companyId: string
  projectId: string
}

export interface RunDiagnosisResult {
  success: boolean
  diagnosisId?: string
  error?: string
}

/**
 * 부족항목 진단 실행 (전체 플로우)
 * 1. 크래딧 차감
 * 2. 진단 레코드 생성
 * 3. 요구사항 추출
 * 4. 갭 분석
 * 5. 결과 저장
 */
export async function runDiagnosis(
  params: RunDiagnosisParams
): Promise<RunDiagnosisResult> {
  const { userId, companyId, projectId } = params

  // 1. 크래딧 차감
  const creditResult = await consumeCredit({
    userId,
    amount: CREDIT_COSTS.DIAGNOSIS,
    description: "부족항목 진단",
    relatedType: "diagnosis",
    relatedId: "", // 진단 ID는 아래에서 업데이트
  })

  if (!creditResult.success) {
    return {
      success: false,
      error: creditResult.error || "크래딧 차감 실패",
    }
  }

  // 2. 진단 레코드 생성
  const diagnosis = await prisma.gapDiagnosis.create({
    data: {
      companyId,
      projectId,
      userId,
      status: "processing",
      creditUsed: CREDIT_COSTS.DIAGNOSIS,
    },
  })

  try {
    // 3. 데이터 조회
    const [project, company] = await Promise.all([
      prisma.supportProject.findUnique({
        where: { id: projectId },
        include: {
          attachments: true,
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        include: {
          documents: {
            include: {
              analysis: true,
            },
          },
        },
      }),
    ])

    if (!project) {
      throw new Error("지원사업을 찾을 수 없습니다.")
    }

    if (!company) {
      throw new Error("기업 정보를 찾을 수 없습니다.")
    }

    // 4. 요구사항 추출
    const projectInfo: ProjectInfo = {
      name: project.name,
      target: project.target,
      eligibility: project.eligibility,
      region: project.region,
      category: project.category,
      summary: project.summary,
    }

    const requirementResult = await extractRequirements(projectInfo)

    if (!requirementResult.success) {
      throw new Error(requirementResult.error || "요구사항 추출 실패")
    }

    // 5. 갭 분석
    const companyInfo: CompanyInfo = {
      name: company.name,
      industry: company.businessCategory || company.mainBusiness,
      foundedAt: company.establishedDate,
      employeeCount: company.employeeCount,
      revenue: company.annualRevenue ? `${company.annualRevenue}원` : null,
      address: company.address,
      certifications: extractCertifications(company.documents),
    }

    const companyDocs: CompanyDocument[] = company.documents.map((doc) => ({
      type: doc.documentType,
      analysisResult: doc.analysis?.summary || null,
    }))

    // RAG 컨텍스트 (향후 구현)
    const ragContext: RagContext = {
      similarCases: [],
      successPatterns: [],
    }

    const gapResult = await analyzeGaps(
      requirementResult.requirements,
      companyInfo,
      companyDocs,
      ragContext
    )

    if (!gapResult.success) {
      throw new Error(gapResult.error || "갭 분석 실패")
    }

    // 6. 결과 저장
    await prisma.gapDiagnosis.update({
      where: { id: diagnosis.id },
      data: {
        status: "completed",
        fitScore: gapResult.fitScore,
        requirements: requirementResult.requirements as unknown as object,
        gaps: gapResult.gaps as unknown as object,
        actions: gapResult.actions as unknown as object,
        completedAt: new Date(),
      },
    })

    return {
      success: true,
      diagnosisId: diagnosis.id,
    }
  } catch (error) {
    console.error("[runDiagnosis] Error:", error)

    // 진단 실패 시 상태 업데이트
    await prisma.gapDiagnosis.update({
      where: { id: diagnosis.id },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      },
    })

    // 크래딧 환불
    await refundCredit({
      userId,
      amount: CREDIT_COSTS.DIAGNOSIS,
      description: "진단 실패로 인한 환불",
      relatedType: "diagnosis",
      relatedId: diagnosis.id,
    })

    return {
      success: false,
      diagnosisId: diagnosis.id,
      error: error instanceof Error ? error.message : "진단 중 오류 발생",
    }
  }
}

// ============================================
// 진단 결과 조회
// ============================================

/**
 * 진단 결과 상세 조회
 */
export async function getDiagnosis(diagnosisId: string, userId: string) {
  const diagnosis = await prisma.gapDiagnosis.findFirst({
    where: {
      id: diagnosisId,
      userId,
    },
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
        },
      },
    },
  })

  if (!diagnosis) {
    return null
  }

  return {
    id: diagnosis.id,
    companyId: diagnosis.companyId,
    projectId: diagnosis.projectId,
    userId: diagnosis.userId,
    status: diagnosis.status as DiagnosisStatus,
    fitScore: diagnosis.fitScore,
    requirements: diagnosis.requirements as unknown as ExtractedRequirement[] | null,
    gaps: diagnosis.gaps as unknown as GapItem[] | null,
    actions: diagnosis.actions as unknown as ActionItem[] | null,
    creditUsed: diagnosis.creditUsed,
    errorMessage: diagnosis.errorMessage,
    createdAt: diagnosis.createdAt.toISOString(),
    completedAt: diagnosis.completedAt?.toISOString() || null,
    company: diagnosis.company,
    project: diagnosis.project,
  }
}

/**
 * 사용자의 진단 목록 조회
 */
export async function getUserDiagnoses(
  userId: string,
  options?: {
    page?: number
    limit?: number
    companyId?: string
    projectId?: string
  }
) {
  const { page = 1, limit = 20, companyId, projectId } = options || {}

  const where = {
    userId,
    ...(companyId && { companyId }),
    ...(projectId && { projectId }),
  }

  const [diagnoses, total] = await Promise.all([
    prisma.gapDiagnosis.findMany({
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gapDiagnosis.count({ where }),
  ])

  return {
    diagnoses: diagnoses.map((d) => ({
      id: d.id,
      companyId: d.companyId,
      projectId: d.projectId,
      userId: d.userId,
      status: d.status as DiagnosisStatus,
      fitScore: d.fitScore,
      creditUsed: d.creditUsed,
      createdAt: d.createdAt.toISOString(),
      completedAt: d.completedAt?.toISOString() || null,
      company: d.company,
      project: d.project,
    })),
    total,
    page,
    limit,
  }
}

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 기업 문서에서 인증 목록 추출
 */
function extractCertifications(
  documents: Array<{
    documentType: string
    analysis?: { extractedData: unknown } | null
  }>
): string[] {
  const certifications: string[] = []

  for (const doc of documents) {
    if (doc.documentType === "sme_certificate") {
      certifications.push("중소기업")
    }
    if (doc.documentType === "certification") {
      // 분석 결과에서 인증 정보 추출
      const data = doc.analysis?.extractedData as Record<string, unknown> | undefined
      if (data?.certificationName) {
        certifications.push(String(data.certificationName))
      }
    }
  }

  return certifications
}
