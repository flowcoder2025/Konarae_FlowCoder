import Link from "next/link";
import type { Metadata } from "next";
import { PublicProjectCard } from "@/components/projects/public-project-card";
import { Button } from "@/components/ui/button";
import { listPublicProjects } from "@/lib/projects/public-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FlowMate - 정부지원사업 보드",
  description: "로그인 없이 정부지원사업을 검색하고 AI 요약으로 지원 조건과 준비 포인트를 빠르게 확인하세요.",
};

export default async function HomePage() {
  const [newProjects, closingSoon, highBenefit, analyzed] = await Promise.all([
    listPublicProjects({ sort: "latest", page: 1, limit: 3 }),
    listPublicProjects({ sort: "closingSoon", page: 1, limit: 3 }),
    listPublicProjects({ sort: "highBenefit", page: 1, limit: 3 }),
    listPublicProjects({ sort: "recentlyUpdated", page: 1, limit: 3 }),
  ]);

  const sections = [
    { title: "새로 수집된 지원사업", projects: newProjects.projects },
    { title: "마감 임박", projects: closingSoon.projects },
    { title: "지원금 규모가 큰 사업", projects: highBenefit.projects },
    { title: "AI 분석 업데이트", projects: analyzed.projects },
  ];

  return (
    <main>
      <section className="border-b bg-muted/30">
        <div className="container mx-auto max-w-6xl px-4 py-16">
          <p className="mb-3 text-sm font-medium text-primary">FlowMate 지원사업 보드</p>
          <h1 className="mb-5 max-w-3xl text-5xl font-bold tracking-tight">복잡한 정부지원사업 공고를 1분 안에 이해하세요</h1>
          <p className="mb-8 max-w-2xl text-muted-foreground">검색, 필터, AI 분석 요약으로 내 상황에 맞는 지원사업의 조건과 준비 포인트를 바로 확인할 수 있습니다.</p>
          <form action="/projects" className="flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input aria-label="홈 지원사업 검색어" className="flex-1 rounded-md border bg-background px-4 py-3" name="q" placeholder="예: 창업, R&D, 수출, 서울" />
            <Button rounded="md" type="submit">검색</Button>
          </form>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 py-12">
        <div className="space-y-12">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <Button asChild rounded="md" variant="outline">
                  <Link href="/projects">전체 보기</Link>
                </Button>
              </div>
              {section.projects.length ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {section.projects.map((project) => <PublicProjectCard key={project.id} project={project} />)}
                </div>
              ) : (
                <div className="rounded-xl border p-8 text-center text-muted-foreground">표시할 지원사업이 없습니다.</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
