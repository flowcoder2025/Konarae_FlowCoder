import { redirect } from "next/navigation"
import { createLogger } from "@/lib/logger"
import { getUserProjects, type UserProjectListItem } from "@/lib/user-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FolderKanban,
  Plus,
  Calendar,
  Building2,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileText,
  Search,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { calculateDaysLeft } from "@/lib/utils"

const logger = createLogger({ page: "my-projects" })

// Step labels for display
const STEP_LABELS = [
  "공고 확인",
  "부족항목 진단",
  "계획서 작성",
  "제출 전 검증",
  "패키징 & 제출",
]

// Status colors (lowercase to match DB values)
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  exploring: { bg: "bg-blue-100", text: "text-blue-700", label: "탐색 중" },
  preparing: { bg: "bg-yellow-100", text: "text-yellow-700", label: "준비 중" },
  writing: { bg: "bg-purple-100", text: "text-purple-700", label: "작성 중" },
  verifying: { bg: "bg-orange-100", text: "text-orange-700", label: "검증 중" },
  submitted: { bg: "bg-green-100", text: "text-green-700", label: "제출 완료" },
  closed: { bg: "bg-gray-100", text: "text-gray-700", label: "마감됨" },
}

interface ProjectCardProps {
  project: UserProjectListItem
}

function ProjectCard({ project }: ProjectCardProps) {
  const statusStyle = STATUS_STYLES[project.status] || STATUS_STYLES.exploring
  const daysLeft = calculateDaysLeft(project.project.deadline)

  return (
    <Link href={`/my-projects/${project.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
        <CardContent className="py-4 sm:py-5">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            {/* Left: Project Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                <h3 className="font-semibold text-sm sm:text-base truncate max-w-[180px] sm:max-w-none">{project.project.name}</h3>
                <Badge className={`${statusStyle.bg} ${statusStyle.text} text-[10px] sm:text-xs shrink-0`}>
                  {statusStyle.label}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1 truncate max-w-[120px] sm:max-w-none">
                  <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="truncate">{project.company.name}</span>
                </span>
                <span className="hidden sm:inline truncate">{project.project.organization}</span>
                {daysLeft !== null && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    D-{daysLeft}
                  </span>
                )}
              </div>
            </div>

            {/* Center: Progress Steps */}
            <div className="hidden md:flex items-center gap-1">
              {STEP_LABELS.map((label, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                    idx + 1 <= project.currentStep
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx + 1 <= project.currentStep ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                  )}
                  <span className="hidden lg:inline">{label}</span>
                </div>
              ))}
            </div>

            {/* Right: Arrow */}
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>

          {/* Mobile Progress Bar */}
          <div className="md:hidden mt-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(project.currentStep / 5) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {project.currentStep}/5
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function CompletedProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/my-projects/${project.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium truncate">{project.project.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {project.company.name}
              </p>
            </div>
            <Badge className="bg-green-100 text-green-700">제출 완료</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function MyProjectsPage() {
  const result = await getUserProjects({ limit: 50 })

  if (!result) {
    redirect("/login")
  }

  const { data: projects } = result

  const activeProjects = projects.filter(
    (p) => p.status !== "closed" && p.status !== "submitted"
  )
  const completedProjects = projects.filter((p) => p.status === "submitted")

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">내 프로젝트</h1>
            <p className="text-sm text-muted-foreground">
              지원 준비 중인 프로젝트를 관리하세요
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href="/projects">
            <Plus className="h-4 w-4 mr-1" />
            새 프로젝트
          </Link>
        </Button>
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              아직 진행 중인 프로젝트가 없습니다
            </h2>
            <p className="text-muted-foreground mb-6">
              지원사업을 찾아 첫 프로젝트를 시작해보세요
            </p>
            <Button asChild size="lg">
              <Link href="/projects">
                <Search className="h-4 w-4 mr-2" />
                지원사업 둘러보기
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">진행 중 ({activeProjects.length})</h2>
          </div>
          <div className="grid gap-4">
            {activeProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Completed Projects */}
      {completedProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h2 className="text-xl font-semibold">제출 완료 ({completedProjects.length})</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedProjects.map((project) => (
              <CompletedProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Quick Link to Pipeline */}
      {projects.length > 0 && (
        <div className="pt-4 border-t">
          <Button variant="outline" asChild>
            <Link href="/pipeline">
              전체 현황을 칸반 보드로 보기
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
