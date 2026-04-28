const BASE_URL = 'http://127.0.0.1:3100';

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

async function fetchJson(path: string) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} did not return JSON: ${text.slice(0, 120)}`);
  }
  return { status: response.status, json };
}

async function main() {
  const projectsPage = await fetch(`${BASE_URL}/projects`);
  const projectsHtml = await projectsPage.text();
  const projectsList = await fetchJson('/api/v1/projects?limit=2&sort=latest');
  const categories = await fetchJson('/api/v1/categories');
  const regions = await fetchJson('/api/v1/regions');

  const firstProjectId = (projectsList.json as { projects?: Array<{ id?: string }> }).projects?.[0]?.id;
  const projectDetail = firstProjectId ? await fetchJson(`/api/v1/projects/${firstProjectId}`) : null;
  const analysisResponse = firstProjectId ? await fetchJson(`/api/v1/projects/${firstProjectId}/analysis`) : null;

  const forbiddenHits = findForbidden({
    projectsList: projectsList.json,
    categories: categories.json,
    regions: regions.json,
    projectDetail: projectDetail?.json,
    analysisResponse: analysisResponse?.json,
  });

  const checks = {
    projectsPageOk: projectsPage.status === 200,
    projectsPageContainsTitle: projectsHtml.includes('로그인 없이 바로 찾는 정부지원사업'),
    projectsListOk: projectsList.status === 200,
    categoriesOk: categories.status === 200,
    regionsOk: regions.status === 200,
    projectDetailOk: projectDetail ? projectDetail.status === 200 : true,
    analysisResponseOk: analysisResponse ? analysisResponse.status === 200 : true,
    forbiddenHitsEmpty: forbiddenHits.length === 0,
  };

  const success = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    firstProjectId: firstProjectId ?? null,
    statuses: {
      projectsPage: projectsPage.status,
      projectsList: projectsList.status,
      categories: categories.status,
      regions: regions.status,
      projectDetail: projectDetail?.status ?? null,
      analysisResponse: analysisResponse?.status ?? null,
    },
    projectsReturned: (projectsList.json as { projects?: unknown[] }).projects?.length ?? null,
    forbiddenHits,
    checks,
    success,
  }, null, 2));

  if (!success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
