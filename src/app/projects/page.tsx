import { PublicProjectCard } from "@/components/projects/public-project-card";
import { Button } from "@/components/ui/button";
import { parsePublicProjectQuery } from "@/lib/projects/public-query";
import { listPublicCategories, listPublicProjects, listPublicRegions } from "@/lib/projects/public-service";

export const dynamic = "force-dynamic";

interface ProjectsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

function pageHref(rawParams: Record<string, string | string[] | undefined>, page: number) {
  const params = toSearchParams(rawParams);
  params.set("page", String(page));
  return `/projects?${params.toString()}`;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const rawParams = await searchParams;
  const query = parsePublicProjectQuery(toSearchParams(rawParams));
  const [result, categories, regions] = await Promise.all([
    listPublicProjects(query),
    listPublicCategories(),
    listPublicRegions(),
  ]);

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10">
      <section className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">지원사업 보드</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight">로그인 없이 바로 찾는 정부지원사업</h1>
        <p className="text-muted-foreground">검색, 필터, AI 분석 요약으로 지원 조건과 준비 포인트를 빠르게 확인하세요.</p>
      </section>

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        <input aria-label="지원사업 검색어" className="rounded-md border bg-background px-3 py-2 md:col-span-2" name="q" placeholder="사업명, 기관, 키워드 검색" defaultValue={query.q ?? ""} />
        <select aria-label="지원사업 분야 필터" className="rounded-md border bg-background px-3 py-2" name="category" defaultValue={query.category ?? ""}>
          <option value="">전체 분야</option>
          {categories.map((item) => <option key={item.category} value={item.category}>{item.category}</option>)}
        </select>
        <select aria-label="지원사업 지역 필터" className="rounded-md border bg-background px-3 py-2" name="region" defaultValue={query.region ?? ""}>
          <option value="">전체 지역</option>
          {regions.map((item) => <option key={item.region} value={item.region}>{item.region}</option>)}
        </select>
        <Button rounded="md" type="submit">검색</Button>
        <Button asChild rounded="md" variant="outline"><a href="/projects">초기화</a></Button>
      </form>

      {result.projects.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">조건에 맞는 지원사업이 없습니다.</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {result.projects.map((project) => <PublicProjectCard key={project.id} project={project} />)}
          </div>
          {result.pagination.totalPages > 1 && (
            <nav aria-label="지원사업 페이지" className="mt-8 flex items-center justify-center gap-3">
              {result.pagination.page > 1 && (
                <Button asChild rounded="md" variant="outline">
                  <a href={pageHref(rawParams, result.pagination.page - 1)}>이전</a>
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {result.pagination.page} / {result.pagination.totalPages}
              </span>
              {result.pagination.page < result.pagination.totalPages && (
                <Button asChild rounded="md" variant="outline">
                  <a href={pageHref(rawParams, result.pagination.page + 1)}>다음</a>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
