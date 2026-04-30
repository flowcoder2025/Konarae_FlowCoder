import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProjectPublic } from "./public-dto";
import type { PublicProjectQuery } from "./public-query";

const PUBLIC_PROJECT_SELECT = {
  id: true,
  name: true,
  organization: true,
  category: true,
  subCategory: true,
  target: true,
  region: true,
  amountMin: true,
  amountMax: true,
  fundingSummary: true,
  amountDescription: true,
  startDate: true,
  endDate: true,
  deadline: true,
  isPermanent: true,
  summary: true,
  descriptionMarkdown: true,
  eligibility: true,
  applicationProcess: true,
  evaluationCriteria: true,
  requiredDocuments: true,
  contactInfo: true,
  websiteUrl: true,
  sourceUrl: true,
  detailUrl: true,
  status: true,
  viewCount: true,
  crawledAt: true,
  updatedAt: true,
  analysisStatus: true,
  analysisConfidence: true,
  hasParsedAttachment: true,
  hasSelectionCriteria: true,
  publicationStatus: true,
  projectAnalysis: true,
} satisfies Prisma.SupportProjectSelect;

const PUBLIC_PROJECT_VISIBILITY_WHERE = {
  deletedAt: null,
  publicationStatus: "visible",
  OR: [{ isCanonical: true }, { groupId: null }],
} satisfies Prisma.SupportProjectWhereInput;

function parseValidDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildWhere(query: PublicProjectQuery): Prisma.SupportProjectWhereInput {
  const and: Prisma.SupportProjectWhereInput[] = [PUBLIC_PROJECT_VISIBILITY_WHERE];

  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { organization: { contains: query.q, mode: "insensitive" } },
        { summary: { contains: query.q, mode: "insensitive" } },
        { target: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  if (query.region) and.push({ region: query.region });
  if (query.category) and.push({ category: query.category });
  if (query.target) and.push({ target: { contains: query.target, mode: "insensitive" } });
  if (query.status) and.push({ status: query.status === "open" ? "active" : query.status });
  if (query.benefitMin !== undefined) and.push({ amountMax: { gte: query.benefitMin } });
  if (query.benefitMax !== undefined) and.push({ amountMin: { lte: query.benefitMax } });
  const deadlineFrom = parseValidDate(query.deadlineFrom);
  const deadlineTo = parseValidDate(query.deadlineTo);
  if (deadlineFrom) and.push({ deadline: { gte: deadlineFrom } });
  if (deadlineTo) and.push({ deadline: { lte: deadlineTo } });

  return { AND: and };
}

function buildOrderBy(sort: PublicProjectQuery["sort"]): Prisma.SupportProjectOrderByWithRelationInput[] {
  if (sort === "closingSoon") return [{ isPermanent: "asc" }, { deadline: "asc" }, { updatedAt: "desc" }];
  if (sort === "highBenefit") return [{ amountMax: "desc" }, { updatedAt: "desc" }];
  if (sort === "recentlyUpdated") return [{ updatedAt: "desc" }];
  return [{ crawledAt: "desc" }, { createdAt: "desc" }];
}

export async function listPublicProjects(query: PublicProjectQuery) {
  const where = buildWhere(query);
  const skip = (query.page - 1) * query.limit;
  const [projects, total] = await Promise.all([
    prisma.supportProject.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: buildOrderBy(query.sort),
      select: PUBLIC_PROJECT_SELECT,
    }),
    prisma.supportProject.count({ where }),
  ]);

  return {
    projects: projects.map(serializeProjectPublic),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getPublicProject(id: string) {
  const project = await prisma.supportProject.findFirst({
    where: { ...PUBLIC_PROJECT_VISIBILITY_WHERE, id },
    select: PUBLIC_PROJECT_SELECT,
  });

  return project ? serializeProjectPublic(project) : null;
}

export async function listPublicCategories() {
  return prisma.supportProject.groupBy({
    by: ["category"],
    where: PUBLIC_PROJECT_VISIBILITY_WHERE,
    _count: true,
    orderBy: { _count: { category: "desc" } },
  });
}

export async function listPublicRegions() {
  return prisma.supportProject.groupBy({
    by: ["region"],
    where: PUBLIC_PROJECT_VISIBILITY_WHERE,
    _count: true,
    orderBy: { _count: { region: "desc" } },
  });
}
