/**
 * UserProject 서버사이드 데이터 페칭 함수
 */

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { cache } from "react"

export interface UserProjectListParams {
  companyId?: string
  status?: string
  includeHidden?: boolean // 숨긴 프로젝트 포함 여부 (기본: false)
  page?: number
  limit?: number
}

export interface UserProjectListResult {
  data: Awaited<ReturnType<typeof getUserProjectsRaw>>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * 사용자의 프로젝트 목록 조회 (서버 컴포넌트용)
 */
export const getUserProjects = cache(
  async (params: UserProjectListParams = {}): Promise<UserProjectListResult | null> => {
    const session = await auth()
    if (!session?.user?.id) return null

    const { companyId, status, includeHidden = false, page = 1, limit = 20 } = params
    const skip = (page - 1) * limit

    const where = {
      userId: session.user.id,
      deletedAt: null,
      ...(companyId && { companyId }),
      ...(status && { status }),
      ...(!includeHidden && { isHidden: false }), // 숨긴 프로젝트 제외
    }

    const [data, total] = await Promise.all([
      getUserProjectsRaw(where, skip, limit),
      prisma.userProject.count({ where }),
    ])

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
)

async function getUserProjectsRaw(
  where: object,
  skip: number,
  take: number
) {
  return prisma.userProject.findMany({
    where,
    select: {
      id: true,
      status: true,
      isHidden: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
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
    take,
  })
}

/**
 * 프로젝트 상세 조회 (서버 컴포넌트용)
 */
export const getUserProject = cache(async (id: string) => {
  const session = await auth()
  if (!session?.user?.id) return null

  return prisma.userProject.findFirst({
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
})

/**
 * 상태별 프로젝트 그룹 조회 (파이프라인용)
 */
export const getUserProjectsByStatus = cache(async (companyId?: string) => {
  const session = await auth()
  if (!session?.user?.id) return null

  const where = {
    userId: session.user.id,
    deletedAt: null,
    ...(companyId && { companyId }),
  }

  const projects = await prisma.userProject.findMany({
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
  })

  // 상태별 그룹화
  const grouped = {
    exploring: projects.filter((p) => p.status === "exploring"),
    preparing: projects.filter((p) => p.status === "preparing"),
    writing: projects.filter((p) => p.status === "writing"),
    verifying: projects.filter((p) => p.status === "verifying"),
    submitted: projects.filter((p) => p.status === "submitted"),
    closed: projects.filter((p) => p.status === "closed"),
  }

  return grouped
})

/**
 * 프로젝트 통계 조회 (대시보드용)
 */
export const getUserProjectStats = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null

  const where = {
    userId: session.user.id,
    deletedAt: null,
  }

  const [total, byStatus] = await Promise.all([
    prisma.userProject.count({ where }),
    prisma.userProject.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
  ])

  const statusCounts = byStatus.reduce(
    (acc, item) => {
      acc[item.status] = item._count
      return acc
    },
    {} as Record<string, number>
  )

  return {
    total,
    exploring: statusCounts.exploring || 0,
    preparing: statusCounts.preparing || 0,
    writing: statusCounts.writing || 0,
    verifying: statusCounts.verifying || 0,
    submitted: statusCounts.submitted || 0,
    closed: statusCounts.closed || 0,
    inProgress: total - (statusCounts.submitted || 0) - (statusCounts.closed || 0),
  }
})

// 타입 export
export type UserProject = NonNullable<Awaited<ReturnType<typeof getUserProject>>>
export type UserProjectListItem = UserProjectListResult["data"][number]
export type UserProjectsByStatus = NonNullable<
  Awaited<ReturnType<typeof getUserProjectsByStatus>>
>
