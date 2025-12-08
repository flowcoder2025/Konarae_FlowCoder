import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProjectCard } from "@/components/projects/project-card";

interface ProjectsPageProps {
  searchParams: Promise<{
    page?: string;
    category?: string;
    region?: string;
    search?: string;
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
  const pageSize = 20;
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

  const [projects, total] = await Promise.all([
    prisma.supportProject.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        subCategory: true,
        target: true,
        region: true,
        amountMin: true,
        amountMax: true,
        amountDescription: true,
        deadline: true,
        isPermanent: true,
        summary: true,
        viewCount: true,
        bookmarkCount: true,
      },
    }),
    prisma.supportProject.count({ where }),
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
      <div className="mb-6">
        <div className="flex items-center gap-4">
          {/* TODO: Add filter components (select, search input) */}
          <p className="text-sm text-muted-foreground">
            총 {total}개의 지원사업
          </p>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">지원사업이 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {/* TODO: Add pagination component */}
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        </div>
      )}
    </div>
  );
}
