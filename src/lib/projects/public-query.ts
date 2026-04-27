export const PUBLIC_PROJECT_SORTS = ["latest", "closingSoon", "highBenefit", "recentlyUpdated"] as const;
export const PUBLIC_PROJECT_STATUSES = ["upcoming", "open", "closingSoon", "closed", "unknown"] as const;

export type PublicProjectSort = (typeof PUBLIC_PROJECT_SORTS)[number];
export type PublicProjectStatus = (typeof PUBLIC_PROJECT_STATUSES)[number];

export interface PublicProjectQuery {
  q?: string;
  region?: string;
  category?: string;
  target?: string;
  status?: PublicProjectStatus;
  benefitMin?: number;
  benefitMax?: number;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort: PublicProjectSort;
  page: number;
  limit: number;
}

function cleanString(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSort(value: string | null): PublicProjectSort {
  return PUBLIC_PROJECT_SORTS.includes(value as PublicProjectSort) ? (value as PublicProjectSort) : "latest";
}

function parseStatus(value: string | null): PublicProjectStatus | undefined {
  return PUBLIC_PROJECT_STATUSES.includes(value as PublicProjectStatus) ? (value as PublicProjectStatus) : undefined;
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "12", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 12;
  return Math.min(parsed, 50);
}

export function parsePublicProjectQuery(searchParams: URLSearchParams): PublicProjectQuery {
  return {
    q: cleanString(searchParams.get("q")),
    region: cleanString(searchParams.get("region")),
    category: cleanString(searchParams.get("category")),
    target: cleanString(searchParams.get("target")),
    status: parseStatus(searchParams.get("status")),
    benefitMin: parsePositiveInt(searchParams.get("benefitMin")),
    benefitMax: parsePositiveInt(searchParams.get("benefitMax")),
    deadlineFrom: cleanString(searchParams.get("deadlineFrom")),
    deadlineTo: cleanString(searchParams.get("deadlineTo")),
    sort: parseSort(searchParams.get("sort")),
    page: parsePage(searchParams.get("page")),
    limit: parseLimit(searchParams.get("limit")),
  };
}
