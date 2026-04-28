# Verification Records

## Pipeline E2E Verification

### Goal
Verify FlowMate support-project pipeline in staged order: dry single-project analysis, controlled one-project crawl, then public board/API checks if local artifacts exist.

### Acceptance Criteria
- [x] DB target is identified without printing credentials.
- [x] Production DB mutation is not performed without explicit approval.
- [x] One existing project is analyzed by explicit project ID only.
- [x] Before/after analysis persistence evidence is recorded.
- [x] One controlled crawl persists/processes at most one project with `TEST_MAX_PROJECTS=1`.
- [x] Crawl discovery, job, project, and attachment outcomes are recorded separately.
- [x] Public board/API checks are performed only if local artifacts exist; evidence records `SKIPPED with reason` because local artifacts are absent.
- [x] Verification commands and blockers are recorded.

### Working Notes
- Current plan: `docs/superpowers/plans/2026-04-27-pipeline-e2e-verification.md`
- Current spec: `docs/superpowers/specs/2026-04-27-pipeline-e2e-verification.md`
- `TEST_MAX_PROJECTS=1` limits persisted/processed projects after discovery; listing fetch may still occur.

### Results
- Preflight DB inspection: PASS — remote Supabase PostgreSQL target identified with credentials redacted.
- DB mutation safety: PASS — remote mutation proceeded only after explicit approval for each scoped expansion listed in Approval Timeline.
- Dry single-project analysis: PASS for `cmnq9prg80ec8qq0zgfb4r5ay`.
- Controlled one-project crawl: PASS_WITH_CONCERN for job `cmohcafvj0001wwethf7mq0ro`; authoritative CrawlJob stats show `projectsNew=0`, `projectsUpdated=1`, while the shared-DB `updatedAt` heuristic captured unrelated concurrent updates.
- Post-crawl analysis: PASS for selected heuristic primary candidate `cmohbywu518k4qq0zrhvl72qv`; concern documented that the same approved project was analyzed twice because the first successful run emitted abbreviated evidence.
- Public board/API check: SKIPPED — local public board/API artifacts are absent, so no build/dev/API endpoint check was run.
- Lint/build: SKIPPED — no app code changed, public artifacts are missing locally, and build/dev were explicitly out of scope.
- Blockers: public board/API boundary could not be verified in this worktree until the merged public board artifacts are present locally; production-like deployment also requires target DB schema columns before public traffic depends on them.

### Approval Timeline
- Task 3 approval: remote Supabase mutation approved only for `analyzeProject` on `cmnq9prg80ec8qq0zgfb4r5ay`.
- Task 4 approval: remote Supabase mutation approved for one controlled crawl of source `cmiy3092g001ksick3otlptfn` with `TEST_MAX_PROJECTS=1`.
- Task 5 approval: remote Supabase mutation approved only for post-crawl `analyzeProject` on selected project `cmohbywu518k4qq0zrhvl72qv`.

### Preflight Evidence
- Command: `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification" exec tsx tasks/tmp/pipeline-preflight.ts'`
- Git root: `/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification`
- Branch/head: `verify/pipeline-e2e` / `277cab9e76b431a9288fa404f638e43c83eeffb4`
- Head equals origin/main: `true`
- Public board artifacts present: apiV1=`false`, apiInternal=`false`, publicProjectsPage=`false`, publicProjectDetail=`false`
- DB target: `postgresql` on `aws-1-ap-northeast-2.pooler.supabase.com/postgres` (credentials redacted)
- DIRECT_URL target: `postgresql` on `aws-1-ap-northeast-2.pooler.supabase.com/postgres` (credentials redacted)
- AI keys present: OPENAI_API_KEY=`true`, GOOGLE_GENERATIVE_AI_API_KEY=`true`, WORKER_API_KEY=`true`
- Candidate project: `cmnq9prg80ec8qq0zgfb4r5ay` — `2026년 1차 온라인판로 종합지원사업 참여기업 모집 공고`
- Candidate parsed attachments: `0`
- Crawl source: `cmiy3092g001ksick3otlptfn` — `K-Startup 중앙부처 · 지자체 · 공공기관`
- Safety decision at preflight time: `APPROVED_FOR_TASK_3_ONLY` — user explicitly approved remote Supabase mutation for single-project dry analysis of `cmnq9prg80ec8qq0zgfb4r5ay`; crawler, broad batch analysis, and other project analysis remained out of scope until later explicit approvals recorded in Approval Timeline.

### Dry Analysis Evidence
- Command: `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification" exec tsx tasks/tmp/pipeline-dry-analysis.ts cmnq9prg80ec8qq0zgfb4r5ay'`
- Project: `cmnq9prg80ec8qq0zgfb4r5ay` — `2026년 1차 온라인판로 종합지원사업 참여기업 모집 공고`
- Analysis version: `1` → `2`
- Analyzed at: `2026-04-08T17:02:02.346Z` → `2026-04-27T15:04:25.650Z`
- Description markdown length: `419` → `818`
- Needs analysis: `false` → `false`
- Needs embedding: `true` → `true`
- Attachment count: `0`
- Parsed attachments covered: `0`
- Checks: success=`true`, descriptionMarkdownNonEmpty=`true`, analysisVersionIncrementedByOne=`true`, analyzedAtUpdated=`true`, needsAnalysisFalse=`true`, needsEmbeddingTrue=`true`
- Result: PASS

### Controlled Crawl Evidence
- Command: `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; TEST_MAX_PROJECTS=1 corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification" exec tsx tasks/tmp/pipeline-controlled-crawl.ts cmiy3092g001ksick3otlptfn'`
- Source: `cmiy3092g001ksick3otlptfn` — `K-Startup 중앙부처 · 지자체 · 공공기관`
- Job: `cmohcafvj0001wwethf7mq0ro`
- Status: `completed`
- Projects found: `216`
- Projects new: `0`
- Projects updated: `1`
- Files processed: `4`
- Changed project IDs captured: `cmohbywu518k4qq0zrhvl72qv`, `cmohcicuf18n2qq0z1bfobr59`, `cmnot26rn0awcqq0zb14drc99`, `cmo7bw5940q13qq0z4g2jnd6a`, `cmohcg9kk18mpqq0zqs1p2alb`
- Heuristic primary changed-project candidate selected for follow-up: `cmohbywu518k4qq0zrhvl72qv` — `2026년 쉬었음청년‧경력보유여성 AI 활용 교육과정`
- Primary attachment count: `4`
- Primary parsed attachment count: `0`
- Primary attachment parse evidence: two `shouldParse=true` HWP files attempted parsing and stored `parseError="No text extracted"`; two poster/non-key files were not parsed.
- Analysis boundary note: Task 4 did not run `analyzeProject` or batch analysis. The crawler itself can perform Gemini-based extraction during file/description processing; for this processed project, parsed attachment count was `0`, HWP parse attempts produced `No text extracted`, and no separate post-crawl analysis was executed in Task 4.
- Guard checks: extra args rejected=`PASS`; unapproved source rejected=`PASS`; `TEST_MAX_PROJECTS=1` required by script.
- Concern investigated: job stats satisfy the at-most-one processed project gate (`projectsNew + projectsUpdated = 1`), but the post-run `updatedAt` heuristic captured 5 projects updated after the pre-run latest timestamp.
- Root cause: `updatedAt > beforeLatestProject.updatedAt` is not causally tied to this crawl job on a shared remote DB, so concurrent/non-job updates during the 6m43s crawl window can be included. The authoritative CrawlJob row for `cmohcafvj0001wwethf7mq0ro` reports `projectsNew=0`, `projectsUpdated=1`, and no other CrawlJob was created in the inspected window.
- No broad retry or additional source was run.
- Result: PASS_WITH_CONCERN

### Post-Crawl Analysis Evidence
- Decision: CrawlJob evidence proves exactly one project was updated (`projectsNew=0`, `projectsUpdated=1`), but the DB does not store a direct job→project link. The follow-up analysis used heuristic primary candidate `cmohbywu518k4qq0zrhvl72qv` from Task 4 evidence, not a definitively job-linked project record.
- Safety scope: `tasks/tmp/pipeline-dry-analysis.ts` now permits exactly two IDs (`cmnq9prg80ec8qq0zgfb4r5ay`, `cmohbywu518k4qq0zrhvl72qv`) and rejects extra args or any other project ID.
- Command: `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification" exec tsx tasks/tmp/pipeline-dry-analysis.ts cmohbywu518k4qq0zrhvl72qv'`
- Project: `cmohbywu518k4qq0zrhvl72qv` — `2026년 쉬었음청년‧경력보유여성 AI 활용 교육과정`
- Analysis version: `1` → `2` in the recorded successful evidence run. Note: an immediately prior scoped run with abbreviated output also succeeded and advanced version `0` → `1` (`descriptionMarkdownLength=101`).
- Analyzed at: `2026-04-27T15:40:30.009Z` → `2026-04-27T15:41:03.649Z`
- Description markdown length: `101` → `156`
- Needs analysis: `false` → `false`
- Needs embedding: `true` → `true`
- Attachment count: `4`
- Parsed attachments covered: `0`
- Checks: success=`true`, descriptionMarkdownNonEmpty=`true`, analysisVersionIncrementedByOne=`true`, analyzedAtUpdated=`true`, needsAnalysisFalse=`true`, needsEmbeddingTrue=`true`
- Guard checks: extra args rejected=`PASS`; unapproved project ID rejected=`PASS`.
- Result: PASS

### Public Board/API Evidence
- Command: `corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification" exec tsx tasks/tmp/pipeline-public-check.ts`
- Artifacts present: apiV1=`false`, apiInternal=`false`, publicProjectsPage=`false`, publicProjectDetail=`false`
- Build status: `SKIPPED` — public board/API artifacts are not present locally.
- API check status: `SKIPPED` — artifact-only check reported `skipped: true`; no base URL was provided or needed.
- Forbidden key hits: `not checked` — endpoint check was skipped because artifacts are absent.
- Result: `SKIPPED with reason: public board/API artifacts are not present locally`

### Final Verification Summary
- Final status: DONE_WITH_BLOCKER — pipeline dry analysis, controlled crawl, and scoped post-crawl analysis were verified; public board/API boundary remains blocked/skipped because required artifacts are absent in this worktree.
- DB target: `postgresql` on `aws-1-ap-northeast-2.pooler.supabase.com/postgres` (credentials redacted).
- Dry analysis project: `cmnq9prg80ec8qq0zgfb4r5ay` — PASS.
- Controlled crawl: source `cmiy3092g001ksick3otlptfn`, job `cmohcafvj0001wwethf7mq0ro` — PASS_WITH_CONCERN; CrawlJob stats are authoritative for one processed project count, but not for project identity.
- Post-crawl analysis project: heuristic candidate `cmohbywu518k4qq0zrhvl72qv` — PASS, with duplicate approved analysis-run concern recorded.
- Public board/API: SKIPPED because `src/app/api/v1`, `src/app/api/internal`, `src/app/projects/page.tsx`, and `src/app/projects/[id]/page.tsx` are absent locally.
- Commands/evidence recorded: preflight script, dry analysis script, controlled crawl script, post-crawl analysis script, public artifact check script; final command run for Task 7 was `git status --short` only.
- Lint/build/dev: SKIPPED because no app code changed and missing public artifacts make build/dev out of scope for this documentation-only finalization.
- Safest next step: sync to a worktree/branch containing the public board artifacts and rerun artifact/API boundary verification after ensuring the target DB has the required public analysis/publication schema.

## Public Board Boundary Verification

### Goal
Verify the public support-project board/API artifacts now present on `origin/main` without mutating the remote database.

### Acceptance Criteria
- [x] Verify `origin/main` contains public board/API artifacts.
- [x] Verify Prisma schema contains public analysis/publication columns locally.
- [x] Install dependencies in the isolated worktree without changing lockfiles.
- [x] Run public DTO/query/schema/internal API tests.
- [x] Run build or document blocker.
- [x] If safe, perform read-only public API/service smoke checks against the configured DB without printing credentials.
- [x] Record final result and blockers.

### Working Notes
- Worktree: `/Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary`
- Branch: `verify/public-board-boundary`
- Base: `origin/main` at `a4345fd WI-001-feat 지원사업 보드 공개 전환 (#1)`
- Remote DB mutations are out of scope; only read-only checks are allowed.
- The previous blocker was local artifact absence. This worktree has the artifacts from `origin/main`.

### Results
- Artifact presence: PASS — `src/app/projects`, `src/app/api/v1`, and `src/app/api/internal` are present on `origin/main`.
- Local schema columns: PASS — `projectAnalysis`, `analysisStatus`, `analysisConfidence`, `hasParsedAttachment`, `hasSelectionCriteria`, and `publicationStatus` exist in `prisma/schema.prisma`.
- Dependency install: PASS — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary install --frozen-lockfile` completed and generated Prisma Client without lockfile changes.
- Unit tests: PASS — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary exec jest __tests__/lib/projects/public-dto.test.ts __tests__/lib/projects/public-query.test.ts __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/internal-api.test.ts --runInBand` passed 4 suites / 26 tests. Next.js emitted a multiple-lockfile workspace-root warning because this is a nested git worktree.
- Build: PASS_WITH_WARNING — `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary" build'` compiled successfully, generated 71 static pages, and included `/projects`, `/projects/[id]`, `/api/v1/projects`, `/api/v1/projects/[id]`, `/api/v1/projects/[id]/analysis`, `/api/v1/categories`, and `/api/v1/regions`. Warnings: Next.js inferred root from the parent lockfile, and ESLint could not load `next/core-web-vitals` from the parent `.eslintrc.json`; the build still completed.
- Read-only public service smoke: PASS — `tasks/tmp/public-service-smoke.ts` queried the configured DB through `listPublicProjects`, `listPublicCategories`, and `listPublicRegions` without mutations. Result: `projectsReturned=2`, `total=5525`, `categoriesReturned=12`, `regionsReturned=18`, `forbiddenHits=[]`.
- Dev server: PASS_WITH_WARNING — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary dev --hostname 127.0.0.1 --port 3100` became ready at `http://127.0.0.1:3100`; same nested-worktree multiple-lockfile warning appeared.
- HTTP public boundary smoke: PASS — `tasks/tmp/public-http-smoke.ts` checked `/projects`, `/api/v1/projects?limit=2&sort=latest`, `/api/v1/categories`, `/api/v1/regions`, `/api/v1/projects/cmo7cdqr20q3gqq0zbm5g0zeg`, and `/api/v1/projects/cmo7cdqr20q3gqq0zbm5g0zeg/analysis`. All returned HTTP 200, `/projects` contained the public board title, `projectsReturned=2`, and `forbiddenHits=[]`.
- Browser check: SKIPPED_WITH_SUBSTITUTE — Playwright MCP backend was already closed (`Target page, context or browser has been closed`), so deterministic HTTP smoke against the running dev server was used instead.

### Final Verification Summary
- Final status: PASS_WITH_WARNINGS.
- The earlier blocker is resolved on `origin/main`: public board/API artifacts exist in the checked-out `a4345fd` worktree.
- The configured DB is schema-compatible with the public board columns and returned public project data through read-only service and HTTP checks.
- Public DTO/API boundary did not expose forbidden internal keys in unit, service, or HTTP smoke checks.
- Warnings: nested worktree causes Next.js multiple-lockfile workspace-root warning; build prints an ESLint config warning for `next/core-web-vitals` from the parent `.eslintrc.json`, but compilation and route generation completed.
