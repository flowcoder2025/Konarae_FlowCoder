import { listPublicCategories, listPublicProjects, listPublicRegions } from '../../src/lib/projects/public-service';
import { parsePublicProjectQuery } from '../../src/lib/projects/public-query';
import { prisma } from '../../src/lib/prisma';

const FORBIDDEN_KEYS = new Set([
  'sourceId',
  'groupId',
  'normalizedName',
  'rawData',
  'contentHash',
  'embedding',
  'embeddingModel',
  'embeddingGeneratedAt',
  'needsEmbedding',
  'needsAnalysis',
  'criteriaExtractedAt',
  'criteriaVersion',
  'deletedAt',
  'projectAnalysis',
  'publicationStatus',
]);

function findForbidden(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbidden(item, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const here = `${path}.${key}`;
    return [
      ...(FORBIDDEN_KEYS.has(key) ? [here] : []),
      ...findForbidden(child, here),
    ];
  });
}

async function main() {
  const result = await listPublicProjects(parsePublicProjectQuery(new URLSearchParams('limit=2&sort=latest')));
  const categories = await listPublicCategories();
  const regions = await listPublicRegions();
  const forbiddenHits = findForbidden({ result, categories, regions });

  console.log(JSON.stringify({
    projectsReturned: result.projects.length,
    total: result.pagination.total,
    categoriesReturned: categories.length,
    regionsReturned: regions.length,
    forbiddenHits,
    success: forbiddenHits.length === 0,
  }, null, 2));

  if (forbiddenHits.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
