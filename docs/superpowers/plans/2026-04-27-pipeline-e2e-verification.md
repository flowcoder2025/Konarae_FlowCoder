# Pipeline E2E Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify FlowMate’s support-project pipeline with dry single-project analysis first, then one controlled crawl, then public board/API checks if the merged public board code is present locally.

**Architecture:** This plan is a verification run, not a feature implementation. It uses existing Prisma models and existing exported functions (`analyzeProject(projectId)` and `processCrawlJob(jobId)`) through temporary `tsx` execution scripts, records before/after DB evidence, and gates public board/API checks on local artifact presence. It avoids broad batch jobs, destructive DB operations, and production DB mutation without explicit user approval.

**Tech Stack:** Next.js 15, TypeScript, Prisma 6, PostgreSQL/Supabase, pnpm, tsx, existing crawler/analyzer modules.

---

## Scope

This plan executes the spec in `docs/superpowers/specs/2026-04-27-pipeline-e2e-verification.md`.

It does not add application code unless a blocker proves the existing entrypoints cannot be safely invoked. It may create temporary scripts under `tasks/tmp/` for controlled local execution and verification evidence. Temporary scripts are not intended for commit unless the user explicitly requests preserving them.

## Current Code Facts

- Git top-level observed during planning: `/Users/jerome/DEV/FlowMate`.
- Current local `main`/`origin/main` observed during planning: `277cab9e76b431a9288fa404f638e43c83eeffb4`.
- Public board artifacts were not present during planning:
  - `src/app/api/v1/**/*.ts` not found.
  - `src/app/api/internal/**/*.ts` not found.
  - `SupportProject.projectAnalysis` and scalar publication/analysis fields not found in `prisma/schema.prisma`.
- Existing analysis entrypoint: `src/lib/crawler/project-analyzer.ts:287` exports `analyzeProject(projectId)`.
- Existing crawl entrypoint: `src/lib/crawler/worker.ts:339` exports `processCrawlJob(jobId)`.
- `TEST_MAX_PROJECTS` is applied after `crawlAndParse(...)` discovery in `src/lib/crawler/worker.ts:371-377`, so it limits persisted/processed projects, not all network/listing fetches.

## File Structure

### Create

- `tasks/tmp/pipeline-preflight.ts` — read-only preflight: repo artifact presence, env presence, redacted DB target, candidate project/source/job inspection.
- `tasks/tmp/pipeline-dry-analysis.ts` — runs `analyzeProject(projectId)` for one explicit project and prints before/after evidence.
- `tasks/tmp/pipeline-controlled-crawl.ts` — creates a single `CrawlJob` for one selected `CrawlSource`, runs `processCrawlJob(jobId)` with `TEST_MAX_PROJECTS=1`, and prints job/project/attachment evidence.
- `tasks/tmp/pipeline-public-check.ts` — checks public board/API artifact presence and, only if a local app URL is provided, verifies selected public endpoints.

### Modify

- `tasks/todo.md` — update working checklist and record final verification evidence.

### Do Not Modify

- `prisma/schema.prisma`.
- `src/lib/crawler/*`.
- `src/app/*`.
- `.env*`.
- `.flowset/*`.

---

## Task 1: Record Verification Checklist

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Read the current task notes**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('/Users/jerome/DEV/FlowMate/tasks/todo.md')
print(p.read_text() if p.exists() else '# Tasks\n')
PY
```

Expected: prints the existing support board planning notes or an empty task file.

- [ ] **Step 2: Replace `tasks/todo.md` with the verification checklist**

Write exactly:

```markdown
# Pipeline E2E Verification

## Goal
Verify FlowMate support-project pipeline in staged order: dry single-project analysis, controlled one-project crawl, then public board/API checks if local artifacts exist.

## Acceptance Criteria
- [ ] DB target is identified without printing credentials.
- [ ] Production DB mutation is not performed without explicit approval.
- [ ] One existing project is analyzed by explicit project ID only.
- [ ] Before/after analysis persistence evidence is recorded.
- [ ] One controlled crawl persists/processes at most one project with `TEST_MAX_PROJECTS=1`.
- [ ] Crawl discovery, job, project, and attachment outcomes are recorded separately.
- [ ] Public board/API checks are performed only if local artifacts exist.
- [ ] Verification commands and blockers are recorded.

## Working Notes
- Current plan: `docs/superpowers/plans/2026-04-27-pipeline-e2e-verification.md`
- Current spec: `docs/superpowers/specs/2026-04-27-pipeline-e2e-verification.md`
- `TEST_MAX_PROJECTS=1` limits persisted/processed projects after discovery; listing fetch may still occur.

## Results
Pending.
```

- [ ] **Step 3: Verify the checklist was written**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('/Users/jerome/DEV/FlowMate/tasks/todo.md')
text = p.read_text()
assert 'Pipeline E2E Verification' in text
assert 'TEST_MAX_PROJECTS=1' in text
print('tasks/todo.md checklist ready')
PY
```

Expected: `tasks/todo.md checklist ready`.

---

## Task 2: Create Read-Only Preflight Script

**Files:**
- Create: `tasks/tmp/pipeline-preflight.ts`

- [ ] **Step 1: Create the preflight script**

Create `tasks/tmp/pipeline-preflight.ts` with this content:

```ts
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';

function shell(command: string): string {
  return execSync(command, {
    cwd: '/Users/jerome/DEV/FlowMate',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function redactDbUrl(value: string | undefined): { present: boolean; host?: string; database?: string; protocol?: string } {
  if (!value) return { present: false };
  try {
    const url = new URL(value);
    return {
      present: true,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      database: url.pathname.replace(/^\//, '') || undefined,
    };
  } catch {
    return { present: true, host: 'unparseable', database: 'unparseable' };
  }
}

async function main() {
  const gitRoot = shell('git rev-parse --show-toplevel');
  const branch = shell('git branch --show-current');
  const head = shell('git rev-parse HEAD');
  const upstream = shell('git rev-parse origin/main');

  const artifacts = {
    apiV1: existsSync('/Users/jerome/DEV/FlowMate/src/app/api/v1'),
    apiInternal: existsSync('/Users/jerome/DEV/FlowMate/src/app/api/internal'),
    publicProjectsPage: existsSync('/Users/jerome/DEV/FlowMate/src/app/projects/page.tsx'),
    publicProjectDetail: existsSync('/Users/jerome/DEV/FlowMate/src/app/projects/[id]/page.tsx'),
  };

  const env = {
    DATABASE_URL: redactDbUrl(process.env.DATABASE_URL),
    DIRECT_URL: redactDbUrl(process.env.DIRECT_URL),
    OPENAI_API_KEY: { present: Boolean(process.env.OPENAI_API_KEY) },
    GOOGLE_GENERATIVE_AI_API_KEY: { present: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) },
    WORKER_API_KEY: { present: Boolean(process.env.WORKER_API_KEY) },
  };

  const candidate = await prisma.supportProject.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { description: { not: null } },
        { eligibility: { not: null } },
        { applicationProcess: { not: null } },
        { evaluationCriteria: { not: null } },
      ],
    },
    orderBy: [{ crawledAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      organization: true,
      analysisVersion: true,
      analyzedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      descriptionMarkdown: true,
      eligibilityCriteria: true,
      attachments: {
        where: { isParsed: true },
        select: { id: true, fileName: true, fileType: true, parsedContent: true },
        take: 3,
      },
    },
  });

  const source = await prisma.crawlSource.findFirst({
    where: { isActive: true },
    orderBy: [{ lastCrawled: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, url: true, type: true, lastCrawled: true },
  });

  const output = {
    git: { gitRoot, branch, head, upstream, headEqualsUpstream: head === upstream },
    artifacts,
    env,
    candidateProject: candidate
      ? {
          ...candidate,
          descriptionMarkdownLength: candidate.descriptionMarkdown?.length ?? 0,
          descriptionMarkdown: undefined,
          hasEligibilityCriteria: candidate.eligibilityCriteria != null,
          eligibilityCriteria: undefined,
          parsedAttachments: candidate.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            fileType: attachment.fileType,
            parsedContentLength: attachment.parsedContent?.length ?? 0,
          })),
          attachments: undefined,
        }
      : null,
    crawlSource: source,
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run TypeScript syntax check through execution**

Run:

```bash
pnpm exec tsx tasks/tmp/pipeline-preflight.ts
```

Expected: JSON output with `git`, `artifacts`, `env`, `candidateProject`, and `crawlSource`. If `DATABASE_URL` is missing, stop and ask the user for environment setup before continuing.

- [ ] **Step 3: Check production DB risk**

Inspect the JSON `env.DATABASE_URL.host` and `env.DATABASE_URL.database`.

Expected decision:
- If it is clearly local/dev/staging, continue.
- If it is production or unclear, stop and ask: `DATABASE_URL appears to target <host>/<database>. May I mutate this DB for one-project verification?`

- [ ] **Step 4: Record preflight evidence in `tasks/todo.md`**

Append this section, replacing values from the JSON output:

```markdown

## Preflight Evidence
- Git root: `<gitRoot>`
- Branch/head: `<branch>` / `<head>`
- Head equals origin/main: `<true|false>`
- Public board artifacts present: apiV1=`<true|false>`, apiInternal=`<true|false>`, publicProjectsPage=`<true|false>`
- DB target: `<protocol>` on `<host>/<database>` (credentials redacted)
- AI keys present: OPENAI_API_KEY=`<true|false>`, GOOGLE_GENERATIVE_AI_API_KEY=`<true|false>`
- Candidate project: `<id>` — `<name>`
- Candidate parsed attachments: `<count>`
- Crawl source: `<id>` — `<name>`
```

---

## Task 3: Run Dry Single-Project Analysis

**Files:**
- Create: `tasks/tmp/pipeline-dry-analysis.ts`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Create the dry analysis script**

Create `tasks/tmp/pipeline-dry-analysis.ts` with this content:

```ts
import { prisma } from '../../src/lib/prisma';
import { analyzeProject } from '../../src/lib/crawler/project-analyzer';

function requireProjectId(): string {
  const projectId = process.argv[2];
  if (!projectId) {
    throw new Error('Usage: pnpm exec tsx tasks/tmp/pipeline-dry-analysis.ts <projectId>');
  }
  return projectId;
}

async function snapshot(projectId: string) {
  const project = await prisma.supportProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      analysisVersion: true,
      analyzedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      descriptionMarkdown: true,
      eligibilityCriteria: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          shouldParse: true,
          isParsed: true,
          parsedContent: true,
          parseError: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!project) throw new Error(`Project not found: ${projectId}`);

  return {
    id: project.id,
    name: project.name,
    analysisVersion: project.analysisVersion,
    analyzedAt: project.analyzedAt?.toISOString() ?? null,
    needsAnalysis: project.needsAnalysis,
    needsEmbedding: project.needsEmbedding,
    descriptionMarkdownLength: project.descriptionMarkdown?.length ?? 0,
    hasEligibilityCriteria: project.eligibilityCriteria != null,
    attachmentCount: project.attachments.length,
    parsedAttachmentCount: project.attachments.filter((attachment) => attachment.isParsed).length,
    parsedAttachmentContentLengths: project.attachments
      .filter((attachment) => attachment.isParsed)
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        parsedContentLength: attachment.parsedContent?.length ?? 0,
        parseError: attachment.parseError,
      })),
  };
}

async function main() {
  const projectId = requireProjectId();
  const before = await snapshot(projectId);
  const result = await analyzeProject(projectId);
  const after = await snapshot(projectId);

  const checks = {
    success: result.success,
    descriptionMarkdownNonEmpty: after.descriptionMarkdownLength > 0,
    analysisVersionIncrementedByOne: after.analysisVersion === before.analysisVersion + 1,
    analyzedAtUpdated: after.analyzedAt !== before.analyzedAt && after.analyzedAt !== null,
    needsAnalysisFalse: after.needsAnalysis === false,
    needsEmbeddingTrue: after.needsEmbedding === true,
  };

  console.log(JSON.stringify({ before, result, after, checks }, null, 2));

  if (!Object.values(checks).every(Boolean)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run dry analysis for the candidate project**

Use the `candidateProject.id` from Task 2.

Run:

```bash
pnpm exec tsx tasks/tmp/pipeline-dry-analysis.ts <candidateProjectId>
```

Expected: JSON where `checks.success`, `descriptionMarkdownNonEmpty`, `analysisVersionIncrementedByOne`, `analyzedAtUpdated`, `needsAnalysisFalse`, and `needsEmbeddingTrue` are all `true`.

- [ ] **Step 3: If AI credentials or quota block the dry run, stop and record the blocker**

Append to `tasks/todo.md`:

```markdown

## Dry Analysis Blocker
- Project: `<candidateProjectId>`
- Error: `<exact summarized error>`
- Next step: configure AI credentials/quota, then rerun Task 3.
```

Do not continue to controlled crawl if dry analysis cannot run because the pipeline’s AI analysis path remains unverified.

- [ ] **Step 4: Record dry analysis evidence**

Append to `tasks/todo.md`:

```markdown

## Dry Analysis Evidence
- Project: `<projectId>` — `<projectName>`
- Analysis version: `<before>` → `<after>`
- Analyzed at: `<before>` → `<after>`
- Description markdown length: `<before>` → `<after>`
- Needs analysis: `<before>` → `<after>`
- Needs embedding: `<before>` → `<after>`
- Parsed attachments covered: `<parsedAttachmentCount>`
- Result: PASS
```

---

## Task 4: Run Controlled One-Project Crawl

**Files:**
- Create: `tasks/tmp/pipeline-controlled-crawl.ts`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Create the controlled crawl script**

Create `tasks/tmp/pipeline-controlled-crawl.ts` with this content:

```ts
import { prisma } from '../../src/lib/prisma';
import { processCrawlJob } from '../../src/lib/crawler/worker';

function requireSourceId(): string {
  const sourceId = process.argv[2];
  if (!sourceId) {
    throw new Error('Usage: TEST_MAX_PROJECTS=1 pnpm exec tsx tasks/tmp/pipeline-controlled-crawl.ts <sourceId>');
  }
  return sourceId;
}

async function main() {
  const sourceId = requireSourceId();
  process.env.TEST_MAX_PROJECTS = '1';

  const source = await prisma.crawlSource.findUnique({
    where: { id: sourceId },
    select: { id: true, name: true, url: true, type: true, isActive: true, lastCrawled: true },
  });

  if (!source) throw new Error(`CrawlSource not found: ${sourceId}`);
  if (!source.isActive) throw new Error(`CrawlSource is not active: ${sourceId}`);

  const beforeLatestProject = await prisma.supportProject.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, updatedAt: true },
  });

  const job = await prisma.crawlJob.create({
    data: { sourceId: source.id, status: 'pending' },
    select: { id: true, sourceId: true, status: true, createdAt: true },
  });

  const stats = await processCrawlJob(job.id);

  const afterJob = await prisma.crawlJob.findUnique({
    where: { id: job.id },
    select: {
      id: true,
      sourceId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      projectsFound: true,
      projectsNew: true,
      projectsUpdated: true,
    },
  });

  const changedProjects = await prisma.supportProject.findMany({
    where: beforeLatestProject
      ? { updatedAt: { gt: beforeLatestProject.updatedAt } }
      : {},
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      name: true,
      organization: true,
      crawledAt: true,
      updatedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          shouldParse: true,
          isParsed: true,
          parsedContent: true,
          parseError: true,
        },
      },
    },
  });

  const evidence = {
    source,
    job: afterJob,
    stats,
    changedProjects: changedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      organization: project.organization,
      crawledAt: project.crawledAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
      needsAnalysis: project.needsAnalysis,
      needsEmbedding: project.needsEmbedding,
      attachmentCount: project.attachments.length,
      parsedAttachmentCount: project.attachments.filter((attachment) => attachment.isParsed).length,
      attachments: project.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        shouldParse: attachment.shouldParse,
        isParsed: attachment.isParsed,
        parsedContentLength: attachment.parsedContent?.length ?? 0,
        parseError: attachment.parseError,
      })),
    })),
  };

  console.log(JSON.stringify(evidence, null, 2));

  if (afterJob?.status !== 'completed') {
    process.exitCode = 1;
  }

  if ((afterJob?.projectsNew ?? 0) + (afterJob?.projectsUpdated ?? 0) > 1) {
    console.error('TEST_MAX_PROJECTS=1 did not limit persisted/processed projects to one');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run controlled crawl using the selected source**

Use the `crawlSource.id` from Task 2.

Run:

```bash
TEST_MAX_PROJECTS=1 pnpm exec tsx tasks/tmp/pipeline-controlled-crawl.ts <crawlSourceId>
```

Expected:
- `job.status` is `completed`.
- `stats.projectsFound` may be more than `1`.
- `job.projectsNew + job.projectsUpdated` is at most `1`.
- `changedProjects` contains the updated/created project if the crawler persisted data.

- [ ] **Step 3: If crawl fails, preserve evidence and stop before broad retries**

Append to `tasks/todo.md`:

```markdown

## Controlled Crawl Blocker
- Source: `<sourceId>` — `<sourceName>`
- Job: `<jobId>`
- Status: `<status>`
- Error: `<exact summarized error>`
- Note: No broad retry performed.
```

Do not switch to another source without asking the user.

- [ ] **Step 4: Record controlled crawl evidence**

Append to `tasks/todo.md`:

```markdown

## Controlled Crawl Evidence
- Source: `<sourceId>` — `<sourceName>`
- Job: `<jobId>`
- Status: `<status>`
- Projects found: `<projectsFound>`
- Projects new: `<projectsNew>`
- Projects updated: `<projectsUpdated>`
- Files processed: `<filesProcessed>`
- Changed project IDs: `<ids>`
- Attachment count: `<count>`
- Parsed attachment count: `<count>`
- Result: PASS
```

---

## Task 5: Analyze At Most One Crawled Project If Needed

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Decide whether the crawled project needs explicit analysis**

From Task 4 `changedProjects`, select one project ID only.

Expected decision:
- If no project changed, skip this task and record `No changed project available for post-crawl analysis`.
- If one project changed, run Task 3’s dry analysis script for that project.

- [ ] **Step 2: Run analysis for the crawled/updated project**

Run:

```bash
pnpm exec tsx tasks/tmp/pipeline-dry-analysis.ts <changedProjectId>
```

Expected: same PASS checks as Task 3.

- [ ] **Step 3: Record post-crawl analysis evidence**

Append to `tasks/todo.md`:

```markdown

## Post-Crawl Analysis Evidence
- Project: `<projectId>` — `<projectName>`
- Analysis version: `<before>` → `<after>`
- Analyzed at: `<before>` → `<after>`
- Description markdown length: `<before>` → `<after>`
- Needs analysis: `<before>` → `<after>`
- Needs embedding: `<before>` → `<after>`
- Result: PASS
```

---

## Task 6: Check Public Board/API Boundary If Available

**Files:**
- Create: `tasks/tmp/pipeline-public-check.ts`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Create the public artifact/API check script**

Create `tasks/tmp/pipeline-public-check.ts` with this content:

```ts
import { existsSync } from 'node:fs';

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
    apiV1: existsSync('/Users/jerome/DEV/FlowMate/src/app/api/v1'),
    apiInternal: existsSync('/Users/jerome/DEV/FlowMate/src/app/api/internal'),
    publicProjectsPage: existsSync('/Users/jerome/DEV/FlowMate/src/app/projects/page.tsx'),
    publicProjectDetail: existsSync('/Users/jerome/DEV/FlowMate/src/app/projects/[id]/page.tsx'),
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
```

- [ ] **Step 2: Run artifact-only check**

Run:

```bash
pnpm exec tsx tasks/tmp/pipeline-public-check.ts
```

Expected:
- If public board artifacts are missing, JSON says `skipped: true` with reason `public board/API artifacts are not present locally`.
- If artifacts exist, JSON says a base URL is needed.

- [ ] **Step 3: If artifacts exist, run build before app/API check**

Run:

```bash
pnpm build
```

Expected: build completes successfully. If build fails, stop and record the exact blocker.

- [ ] **Step 4: If artifacts exist, start app and run API boundary check**

Start app in a separate background task:

```bash
pnpm dev
```

Then run:

```bash
pnpm exec tsx tasks/tmp/pipeline-public-check.ts http://localhost:3000
```

Expected:
- `/api/v1/projects` returns a successful response.
- `forbiddenKeyHits` is an empty array.

- [ ] **Step 5: Record public check evidence**

Append to `tasks/todo.md`:

```markdown

## Public Board/API Evidence
- Artifacts present: apiV1=`<true|false>`, apiInternal=`<true|false>`, publicProjectsPage=`<true|false>`
- Build status: `<PASS|SKIPPED|FAIL>`
- API check status: `<PASS|SKIPPED|FAIL>`
- Forbidden key hits: `<none or list>`
- Result: `<PASS|SKIPPED with reason|FAIL>`
```

---

## Task 7: Run Final Verification and Summarize

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run lint if application code changed**

If only `tasks/` and `docs/superpowers/` files changed, skip lint and record why.

If any `src/`, `prisma/`, or config file changed, run:

```bash
pnpm lint
```

Expected: PASS, or record blocker.

- [ ] **Step 2: Run build if public board/API artifacts exist and were checked**

If Task 6 already ran `pnpm build`, reuse that result.

If Task 6 was skipped because artifacts were missing, do not run build solely for missing artifacts.

Expected: PASS if run.

- [ ] **Step 3: Update `tasks/todo.md` results**

Replace `## Results\nPending.` with:

```markdown
## Results
- Dry single-project analysis: `<PASS|FAIL|BLOCKED>`
- Controlled one-project crawl: `<PASS|FAIL|BLOCKED>`
- Post-crawl analysis: `<PASS|FAIL|SKIPPED>`
- Public board/API check: `<PASS|FAIL|SKIPPED>`
- Lint/build: `<PASS|FAIL|SKIPPED with reason>`
- Blockers: `<none or concise list>`
```

- [ ] **Step 4: Report verification story to the user**

Include:
- DB target identity with credentials redacted.
- Project ID used for dry verification.
- Crawl source/job ID used for controlled crawl.
- Whether public board/API artifacts were present locally.
- Commands run and outcomes.
- Any blockers and the safest next step.

---

## Self-Review

- Spec coverage: covered DB target safety, dry analysis, controlled crawl, post-crawl analysis, public-safe checks, evidence capture, and verification command policy.
- Placeholder scan: no `TBD`, `TODO`, “similar to,” or unbounded “handle edge cases” instructions remain.
- Type consistency: plan uses existing `SupportProject`, `ProjectAttachment`, `CrawlSource`, and `CrawlJob` fields from `prisma/schema.prisma`; entrypoints match `analyzeProject(projectId)` and `processCrawlJob(jobId)` exports.
- Scope check: this is one verification workflow, not multiple independent product subsystems.
