export const DEFAULT_SITEMAP_PROJECT_LIMIT = 5000;
export const MAX_SITEMAP_PROJECT_LIMIT = 50000;

export function parseSitemapProjectLimit(value = process.env.SITEMAP_PROJECT_LIMIT): number {
  const raw = value?.trim();
  if (!raw) return DEFAULT_SITEMAP_PROJECT_LIMIT;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_SITEMAP_PROJECT_LIMIT;
  if (parsed === 0) return 0;

  return Math.min(parsed, MAX_SITEMAP_PROJECT_LIMIT);
}
