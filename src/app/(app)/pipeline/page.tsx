import { redirect } from "next/navigation"
import { getUserProjectsByStatus } from "@/lib/user-projects"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { PipelineClient } from "./pipeline-client"
import type { PipelineProject } from "@/components/pipeline"
import { calculateDaysLeft } from "@/lib/utils"

// Status mapping (lowercase DB values to uppercase display values)
const STATUS_MAP: Record<string, string> = {
  exploring: "EXPLORING",
  preparing: "PREPARING",
  writing: "WRITING",
  verifying: "VERIFYING",
  submitted: "SUBMITTED",
  closed: "SUBMITTED", // Map closed to submitted column
}

interface PipelinePageProps {
  searchParams: Promise<{
    showHidden?: string
  }>
}

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const params = await searchParams
  const showHidden = params.showHidden === "true"

  // 프로젝트 조회 (숨긴 프로젝트 포함 여부에 따라)
  const projectsByStatus = await getUserProjectsByStatus({ includeHidden: showHidden })

  if (!projectsByStatus) {
    redirect("/login")
  }

  // 숨긴 프로젝트 수 조회
  const hiddenCount = await prisma.userProject.count({
    where: {
      userId: session.user.id,
      deletedAt: null,
      isHidden: true,
    },
  })

  // Transform data for PipelineBoard
  const pipelineData: Record<string, PipelineProject[]> = {
    EXPLORING: [],
    PREPARING: [],
    WRITING: [],
    VERIFYING: [],
    SUBMITTED: [],
  }

  // Process each status group
  Object.entries(projectsByStatus).forEach(([status, projects]) => {
    const displayStatus = STATUS_MAP[status] || "EXPLORING"

    projects.forEach((project) => {
      const pipelineProject: PipelineProject = {
        id: project.id,
        projectName: project.project.name,
        companyName: project.company.name,
        status: displayStatus,
        currentStep: project.currentStep,
        deadline: project.project.deadline?.toISOString() || null,
        daysLeft: calculateDaysLeft(project.project.deadline),
        matchScore: project.matchingResult?.totalScore || 0,
        isHidden: project.isHidden,
      }

      if (pipelineData[displayStatus]) {
        pipelineData[displayStatus].push(pipelineProject)
      }
    })
  })

  return (
    <PipelineClient
      data={pipelineData}
      hiddenCount={hiddenCount}
      showHidden={showHidden}
    />
  )
}
