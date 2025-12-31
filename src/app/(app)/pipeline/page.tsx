import { redirect } from "next/navigation"
import { getUserProjectsByStatus } from "@/lib/user-projects"
import { Button } from "@/components/ui/button"
import { Kanban, Plus } from "lucide-react"
import Link from "next/link"
import { PipelineBoard } from "@/components/pipeline"
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

export default async function PipelinePage() {
  const projectsByStatus = await getUserProjectsByStatus()

  if (!projectsByStatus) {
    redirect("/login")
  }

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
      }

      if (pipelineData[displayStatus]) {
        pipelineData[displayStatus].push(pipelineProject)
      }
    })
  })

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Kanban className="h-8 w-8 text-primary" />
            파이프라인
          </h1>
          <p className="mt-1 text-muted-foreground">
            모든 프로젝트를 한눈에 관리하세요
          </p>
        </div>
        <Button asChild>
          <Link href="/projects">
            <Plus className="h-4 w-4 mr-2" />
            새 프로젝트
          </Link>
        </Button>
      </div>

      {/* Pipeline Board */}
      <PipelineBoard data={pipelineData} />
    </div>
  )
}
