import { existsSync } from 'node:fs';

const repoRoot = '/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification';

const forbiddenKeys = [
  'rawPrompt',
  'evidenceText',
  'parsedContent',
  'sourceUrl',
  'crawlJobId',
  'sourceId',
  'userId',
  'companyId',
  'matchingResults',
  'businessPlans',
  'deletedAt',
];

async function fetchJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { nonJsonBody: text.slice(0, 500) };
  }
  return { path, status: response.status, ok: response.ok, json };
}

function findForbiddenKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const currentPath = `${path}.${key}`;
      const hits = forbiddenKeys.includes(key) ? [currentPath] : [];
      return hits.concat(findForbiddenKeys(nested, currentPath));
    });
  }

  return [];
}

async function main() {
  const artifacts = {
    apiV1: existsSync(`${repoRoot}/src/app/api/v1`),
    apiInternal: existsSync(`${repoRoot}/src/app/api/internal`),
    publicProjectsPage: existsSync(`${repoRoot}/src/app/projects/page.tsx`),
    publicProjectDetail: existsSync(`${repoRoot}/src/app/projects/[id]/page.tsx`),
  };

  const baseUrl = process.argv[2];
  if (!artifacts.apiV1 || !artifacts.publicProjectsPage) {
    console.log(JSON.stringify({ artifacts, skipped: true, reason: 'public board/API artifacts are not present locally' }, null, 2));
    return;
  }

  if (!baseUrl) {
    console.log(JSON.stringify({ artifacts, skipped: true, reason: 'base URL not provided; start the app and rerun with http://localhost:3000' }, null, 2));
    return;
  }

  const list = await fetchJson(baseUrl, '/api/v1/projects');
  const forbiddenInList = findForbiddenKeys(list.json);

  const output = {
    artifacts,
    checks: [list],
    forbiddenKeyHits: forbiddenInList,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!list.ok || forbiddenInList.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
