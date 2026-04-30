import { ProjectAnalysisPublicSchema, ProjectAnalysisSchema, type ProjectAnalysisPublicDto } from "./analysis-schema";

type NullableDate = Date | string | null | undefined;

type ProjectPublicSource = {
  id: string;
  name: string;
  organization: string;
  category: string;
  subCategory?: string | null;
  target: string;
  region: string;
  amountMin?: bigint | number | null;
  amountMax?: bigint | number | null;
  fundingSummary?: string | null;
  amountDescription?: string | null;
  startDate?: NullableDate;
  endDate?: NullableDate;
  deadline?: NullableDate;
  isPermanent?: boolean | null;
  summary: string;
  descriptionMarkdown?: string | null;
  eligibility?: string | null;
  applicationProcess?: string | null;
  evaluationCriteria?: string | null;
  requiredDocuments?: unknown;
  contactInfo?: string | null;
  websiteUrl?: string | null;
  detailUrl?: string | null;
  sourceUrl?: string | null;
  status: string;
  viewCount: number;
  crawledAt?: NullableDate;
  updatedAt?: NullableDate;
  analysisStatus?: string | null;
  analysisConfidence?: string | null;
  hasParsedAttachment?: boolean | null;
  hasSelectionCriteria?: boolean | null;
  projectAnalysis?: unknown;
};

export interface ProjectPublicDto {
  id: string;
  title: string;
  organization: string;
  category: string;
  subCategory: string | null;
  target: string;
  region: string;
  amount: {
    min: number | null;
    max: number | null;
    summary: string | null;
    description: string | null;
  };
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  isPermanent: boolean;
  summary: string;
  analysisMarkdown: string | null;
  eligibility: string | null;
  applicationProcess: string | null;
  evaluationCriteria: string | null;
  requiredDocuments: string[];
  contactInfo: string | null;
  websiteUrl: string | null;
  sourceUrl: string | null;
  status: string;
  viewCount: number;
  crawledAt: string | null;
  updatedAt: string;
  trust: {
    analysisStatus: string;
    confidence: string | null;
    hasParsedAttachment: boolean;
    hasSelectionCriteria: boolean;
  };
  analysis: ProjectAnalysisPublicDto | null;
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toIso(value: NullableDate): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function serializeProjectAnalysisPublic(value: unknown): ProjectAnalysisPublicDto | null {
  const full = ProjectAnalysisSchema.safeParse(value);
  if (!full.success) return null;

  return ProjectAnalysisPublicSchema.parse({
    ...full.data,
    quality: {
      confidence: full.data.quality.confidence,
      hasParsedAttachment: full.data.quality.hasParsedAttachment,
      hasSelectionCriteria: full.data.quality.hasSelectionCriteria,
    },
  });
}

export function serializeProjectPublic(project: ProjectPublicSource): ProjectPublicDto {
  return {
    id: project.id,
    title: project.name,
    organization: project.organization,
    category: project.category,
    subCategory: project.subCategory ?? null,
    target: project.target,
    region: project.region,
    amount: {
      min: toNumber(project.amountMin),
      max: toNumber(project.amountMax),
      summary: project.fundingSummary ?? null,
      description: project.amountDescription ?? null,
    },
    startDate: toIso(project.startDate),
    endDate: toIso(project.endDate),
    deadline: toIso(project.deadline),
    isPermanent: Boolean(project.isPermanent),
    summary: project.summary,
    analysisMarkdown: project.descriptionMarkdown ?? null,
    eligibility: project.eligibility ?? null,
    applicationProcess: project.applicationProcess ?? null,
    evaluationCriteria: project.evaluationCriteria ?? null,
    requiredDocuments: toStringArray(project.requiredDocuments),
    contactInfo: project.contactInfo ?? null,
    websiteUrl: project.websiteUrl ?? null,
    sourceUrl: project.detailUrl ?? project.sourceUrl ?? null,
    status: project.status,
    viewCount: project.viewCount,
    crawledAt: toIso(project.crawledAt),
    updatedAt: toIso(project.updatedAt) ?? new Date().toISOString(),
    trust: {
      analysisStatus: project.analysisStatus ?? "pending",
      confidence: project.analysisConfidence ?? null,
      hasParsedAttachment: Boolean(project.hasParsedAttachment),
      hasSelectionCriteria: Boolean(project.hasSelectionCriteria),
    },
    analysis: serializeProjectAnalysisPublic(project.projectAnalysis),
  };
}
