import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectPagination } from "@/components/projects/project-pagination";
import { ProjectListClient } from "@/components/projects/project-list-client";

interface ProjectsPageProps {
  searchParams: Promise<{
    page?: string;
    category?: string;
    region?: string;
    search?: string;
    deadline?: string;
    sort?: string;
  }>;
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const pageSize = 12;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: any = {
    deletedAt: null,
    status: "active",
  };

  if (params.category) {
    where.category = params.category;
  }

  if (params.region) {
    where.region = params.region;
  }

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { organization: { contains: params.search, mode: "insensitive" } },
      { summary: { contains: params.search, mode: "insensitive" } },
    ];
  }

  // Handle deadline filter
  if (params.deadline) {
    if (params.deadline === "permanent") {
      where.isPermanent = true;
    } else {
      const days = parseInt(params.deadline);
      if (!isNaN(days)) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        where.deadline = {
          lte: futureDate,
          gte: new Date(),
        };
        where.isPermanent = false;
      }
    }
  }

  // Build orderBy based on sort parameter
  const sort = params.sort || "latest"; // 기본값: 최신순
  let orderBy: any[];

  switch (sort) {
    case "deadline":
      // 마감일순: 상시모집 아닌 것 먼저 → 마감일 빠른 순
      orderBy = [
        { isPermanent: "asc" },
        { deadline: "asc" },
        { createdAt: "desc" },
      ];
      break;
    case "views":
      // 조회순: 조회수 많은 순
      orderBy = [{ viewCount: "desc" }, { createdAt: "desc" }];
      break;
    case "latest":
    default:
      // 최신순: 등록일 최신 순
      orderBy = [{ createdAt: "desc" }];
      break;
  }

  // Get categories and regions for filters
  const [projects, total, categories, regions] = await Promise.all([
    prisma.supportProject.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      select: {
        id: true,
        name: true,
        organization: true,
        sourceUrl: true,
        category: true,
        subCategory: true,
        target: true,
        region: true,
        amountMin: true,
        amountMax: true,
        fundingSummary: true,
        deadline: true,
        isPermanent: true,
        summary: true,
        viewCount: true,
      },
    }),
    prisma.supportProject.count({ where }),
    prisma.supportProject.groupBy({
      by: ["category"],
      where: { deletedAt: null, status: "active" },
      _count: true,
      orderBy: { _count: { category: "desc" } },
    }),
    prisma.supportProject.groupBy({
      by: ["region"],
      where: { deletedAt: null, status: "active" },
      _count: true,
      orderBy: { _count: { region: "desc" } },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">지원사업 탐색</h1>
        <p className="text-muted-foreground">
          기업에 맞는 정부 지원사업을 찾아보세요
        </p>
      </div>

      {/* Filters */}
      <ProjectFilters
        categories={categories.map((c) => ({
          value: c.category,
          count: c._count,
        }))}
        regions={regions.map((r) => ({ value: r.region, count: r._count }))}
        currentCategory={params.category}
        currentRegion={params.region}
        currentSearch={params.search}
        currentDeadline={params.deadline}
        currentSort={params.sort}
        total={total}
      />

      {/* Projects Grid with Pull-to-Refresh */}
      <ProjectListClient>
        {projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {params.search ||
              params.category ||
              params.region ||
              params.deadline
                ? "검색 조건에 맞는 지원사업이 없습니다"
                : "지원사업이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </ProjectListClient>

      {/* Pagination */}
      <ProjectPagination
        currentPage={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
