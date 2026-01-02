import { redirect } from "next/navigation"
import { getUserProjects } from "@/lib/user-projects"
import { MyProjectsClient } from "./my-projects-client"

interface MyProjectsPageProps {
  searchParams: Promise<{
    showHidden?: string
  }>
}

export default async function MyProjectsPage({ searchParams }: MyProjectsPageProps) {
  const params = await searchParams
  const showHidden = params.showHidden === "true"

  const result = await getUserProjects({ limit: 50, includeHidden: showHidden })

  if (!result) {
    redirect("/login")
  }

  const { data: projects } = result

  // 숨김 처리된 프로젝트와 표시 프로젝트 분리
  const visibleProjects = projects.filter((p) => !p.isHidden)
  const hiddenProjects = projects.filter((p) => p.isHidden)

  return (
    <MyProjectsClient
      projects={visibleProjects}
      hiddenProjects={hiddenProjects}
      showHidden={showHidden}
    />
  )
}
