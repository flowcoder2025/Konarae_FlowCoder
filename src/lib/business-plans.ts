/**
 * 사업계획서 관련 서버 사이드 유틸리티
 */

import { prisma } from "@/lib/prisma"
import { check } from "@/lib/rebac"

/**
 * 사업계획서 상세 조회 (서버 컴포넌트용)
 * - 권한 체크 포함
 * - 클라이언트 컴포넌트에 전달할 데이터 형태로 반환
 */
export async function getBusinessPlan(businessPlanId: string, userId: string) {
  // 사업계획서 조회 (회사 권한 체크를 위해 companyId도 함께 조회)
  const businessPlan = await prisma.businessPlan.findUnique({
    where: { id: businessPlanId },
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
        },
      },
      sections: {
        orderBy: { sectionIndex: "asc" },
        select: {
          id: true,
          sectionIndex: true,
          title: true,
          content: true,
          isAiGenerated: true,
        },
      },
    },
  })

  if (!businessPlan) {
    return null
  }

  // 권한 체크 (회사에 대한 viewer 권한 필요)
  const hasPermission = await check(userId, "company", businessPlan.companyId, "viewer")

  if (!hasPermission) {
    return null
  }

  return {
    id: businessPlan.id,
    title: businessPlan.title,
    status: businessPlan.status,
    company: businessPlan.company,
    project: businessPlan.project,
    sections: businessPlan.sections,
  }
}
