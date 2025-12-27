import { redirect, notFound } from "next/navigation"
import { getUserProject } from "@/lib/user-projects"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { ProjectWorkspace } from "@/components/projects"
import { calculateDaysLeft } from "@/lib/utils"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params

  const userProject = await getUserProject(id)

  if (!userProject) {
    notFound()
  }

  const daysLeft = calculateDaysLeft(userProject.project.deadline)
  const matchScore = userProject.matchingResult?.totalScore || 0

  // Convert step completions to array format
  const stepCompletions = [
    userProject.step1Completed,
    userProject.step2Completed,
    userProject.step3Completed,
    userProject.step4Completed,
    userProject.step5Completed,
  ]

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Back Navigation */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/my-projects">
            <ArrowLeft className="h-4 w-4 mr-2" />
            내 프로젝트로 돌아가기
          </Link>
        </Button>
      </div>

      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{userProject.project.name}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {userProject.company.name}
              </span>
              <span>{userProject.project.organization}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {daysLeft !== null && (
              <Badge variant={daysLeft <= 7 ? "destructive" : "secondary"}>
                <Calendar className="h-3 w-3 mr-1" />
                D-{daysLeft}
              </Badge>
            )}
            {matchScore > 0 && (
              <Badge variant="outline">적합도 {matchScore}점</Badge>
            )}
          </div>
        </div>

        {(userProject.project.websiteUrl || userProject.project.detailUrl) && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={userProject.project.detailUrl || userProject.project.websiteUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              공고 원문 보기
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        )}
      </div>

      {/* Project Workspace */}
      <ProjectWorkspace
        projectId={userProject.id}
        projectUrl={userProject.project.detailUrl || userProject.project.websiteUrl}
        companyId={userProject.companyId}
        existingPlanId={userProject.businessPlan?.id || null}
        initialStep={userProject.currentStep}
        initialCompletions={stepCompletions}
      />
    </div>
  )
}
