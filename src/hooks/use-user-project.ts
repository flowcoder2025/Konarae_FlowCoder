"use client"

/**
 * UserProject 클라이언트 훅
 * API 호출 및 상태 관리
 */

import { useState, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"

// Types
export interface UserProjectCreateData {
  companyId: string
  projectId: string
  matchingResultId?: string
}

export interface UserProjectUpdateData {
  currentStep?: number
  step1Completed?: boolean
  step2Completed?: boolean
  step3Completed?: boolean
  step4Completed?: boolean
  step5Completed?: boolean
  status?: string
  businessPlanId?: string | null
  diagnosisId?: string | null
  evaluationId?: string | null
  matchingResultId?: string | null
}

interface UseUserProjectResult {
  isLoading: boolean
  error: string | null
  createProject: (data: UserProjectCreateData) => Promise<{ id: string } | null>
  updateProject: (id: string, data: UserProjectUpdateData) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  completeStep: (id: string, step: number) => Promise<boolean>
  advanceToStep: (id: string, step: number) => Promise<boolean>
  updateStatus: (id: string, status: string) => Promise<boolean>
}

/**
 * UserProject 뮤테이션 훅
 */
export function useUserProject(): UseUserProjectResult {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading = isLoading || isPending

  /**
   * 새 프로젝트 생성
   */
  const createProject = useCallback(
    async (data: UserProjectCreateData): Promise<{ id: string } | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/user-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        const result = await response.json()

        if (!response.ok) {
          // 이미 존재하는 경우 기존 ID 반환
          if (response.status === 409 && result.userProjectId) {
            return { id: result.userProjectId }
          }
          throw new Error(result.error || "프로젝트 생성에 실패했습니다")
        }

        startTransition(() => {
          router.refresh()
        })

        return { id: result.id }
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류"
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  /**
   * 프로젝트 업데이트
   */
  const updateProject = useCallback(
    async (id: string, data: UserProjectUpdateData): Promise<boolean> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/user-projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || "프로젝트 업데이트에 실패했습니다")
        }

        startTransition(() => {
          router.refresh()
        })

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류"
        setError(message)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  /**
   * 프로젝트 삭제
   */
  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/user-projects/${id}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || "프로젝트 삭제에 실패했습니다")
        }

        startTransition(() => {
          router.refresh()
        })

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류"
        setError(message)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  /**
   * 특정 단계 완료 처리
   */
  const completeStep = useCallback(
    async (id: string, step: number): Promise<boolean> => {
      if (step < 1 || step > 5) {
        setError("단계는 1-5 사이여야 합니다")
        return false
      }

      const stepKey = `step${step}Completed` as keyof UserProjectUpdateData
      return updateProject(id, { [stepKey]: true })
    },
    [updateProject]
  )

  /**
   * 특정 단계로 이동
   */
  const advanceToStep = useCallback(
    async (id: string, step: number): Promise<boolean> => {
      if (step < 1 || step > 5) {
        setError("단계는 1-5 사이여야 합니다")
        return false
      }

      // 상태 자동 업데이트 로직
      const statusMap: Record<number, string> = {
        1: "exploring",
        2: "preparing",
        3: "writing",
        4: "verifying",
        5: "submitted",
      }

      return updateProject(id, {
        currentStep: step,
        status: statusMap[step] || "exploring",
      })
    },
    [updateProject]
  )

  /**
   * 상태 변경
   */
  const updateStatus = useCallback(
    async (id: string, status: string): Promise<boolean> => {
      return updateProject(id, { status })
    },
    [updateProject]
  )

  return {
    isLoading: loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    completeStep,
    advanceToStep,
    updateStatus,
  }
}

/**
 * 프로젝트 시작 훅 (매칭 결과에서 프로젝트 시작)
 */
export function useStartProject() {
  const router = useRouter()
  const { createProject, isLoading, error } = useUserProject()

  const startProject = useCallback(
    async (companyId: string, projectId: string, matchingResultId?: string) => {
      const result = await createProject({
        companyId,
        projectId,
        matchingResultId,
      })

      if (result?.id) {
        router.push(`/my-projects/${result.id}`)
        return true
      }

      return false
    },
    [createProject, router]
  )

  return { startProject, isLoading, error }
}
