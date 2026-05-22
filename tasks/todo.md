# Public Project Freshness and Links Implementation Plan

Goal: Make public project cards and detail pages show freshness dates, original links, and attachment links without broad schema changes.

Architecture:
- Keep the public API boundary in `src/lib/projects/public-dto.ts` and `src/lib/projects/public-service.ts`.
- Add public-safe attachment metadata to `ProjectPublicDto` from `ProjectAttachment`, plus fallback links from `attachmentUrls` and `originalFileUrl`.
- Render date/link metadata in `PublicProjectCard` and `src/app/projects/[id]/page.tsx` using small local helpers.

Tech Stack: Next.js App Router, React Server Components, Prisma select DTO serialization, Jest + Testing Library.

Acceptance criteria:
- Summary cards show a freshness date using the currently available `crawledAt → updatedAt` fallback, with clear `수집일` or `갱신일` labels. Do not treat `startDate` as 게시일.
- Detail page shows the same freshness metadata and formats deadline/date values for Korean users.
- Detail page shows original link from `project.sourceUrl ?? project.websiteUrl` with label distinguishing `원문 바로가기` from fallback `기관 페이지 보기`.
- Detail page shows deduped, safe attachment links from detail-only `ProjectAttachment.sourceUrl`, `attachmentUrls`, and `originalFileUrl` without exposing parsed content or internal analysis evidence.
- Public URL rendering only allows `http:` and `https:` hrefs and uses `rel="noopener noreferrer"` for new tabs.
- Existing public DTO stripping remains intact.

Working Notes:
- Untracked `.agents/skills/flow-ui/` and `.claude/scheduled_tasks.lock` are unrelated local harness artifacts; do not include them in this change.
- Existing DTO already maps `sourceUrl` from `detailUrl ?? sourceUrl`; UI should use that before `websiteUrl`.
- Keep list and detail Prisma selects separate so list cards do not fetch attachment relations.
- `SupportProject` has `attachmentUrls`, `originalFileUrl`, `originalFileType`, and `attachments ProjectAttachment[]`.
- `ProjectAttachment` public-safe fields are `id`, `fileName`, `fileType`, `fileSize`, `sourceUrl`, `createdAt`.

Tasks:
- [x] Add failing DTO tests in `__tests__/lib/projects/public-dto.test.ts` for public attachment serialization, URL dedupe/safety, missing attachment defaults, and DTO key list update.
- [x] Add failing detail page test in `__tests__/app/project-detail-page.test.tsx` for freshness label, original link, website fallback label, safe URL filtering, and attachment links.
- [x] Add `attachments` and fallback attachment source fields to `ProjectPublicDto` in `src/lib/projects/public-dto.ts`.
- [x] Split `PUBLIC_PROJECT_SELECT` into list/detail selects in `src/lib/projects/public-service.ts`; include attachment fields only in the detail select used by `getPublicProject()`.
- [x] Update `src/components/projects/public-project-card.tsx` to render a labeled `수집일`/`갱신일` date and keep deadline display intact.
- [x] Update `src/app/projects/[id]/page.tsx` to format dates, show safe source link, show deduped safe attachment link card, and use `outline` style only for link CTA buttons.
- [x] Run focused tests: `npm test -- __tests__/lib/projects/public-dto.test.ts __tests__/app/project-detail-page.test.tsx`.
- [x] Run typecheck: `npx tsc --noEmit`.
- [x] Run build: `npm run build`.
- [x] If build passes, run local browser verification for `/projects` and one `/projects/[id]` page.
- [x] Summarize changed files and verification results; do not commit unless explicitly requested.

Results:
- Added public attachment DTO serialization with safe `http/https` filtering and URL dedupe.
- Split public project list/detail selects so attachment relation data is fetched only by `getPublicProject()`.
- Cards now show `수집일` or `갱신일`; detail pages show formatted deadline/freshness, source link, and attachment links or fallback copy.
- Verification passed: focused Jest (18 tests), `npx tsc --noEmit`, `npm run build`, and browser checks for `/projects` plus one `/projects/[id]` page.
- Build still reports pre-existing lint warnings outside this change; local browser console still reports the existing manifest CORS redirect issue.

---

# RHWP Parser PoC Plan

Goal: Verify whether rhwp can improve FlowMate HWP/HWPX text extraction before wiring it into operational retry parsing.

Acceptance criteria:
- Confirm the usable rhwp package/API surface from the current ecosystem.
- Run rhwp against one real failed HWP/HWPX attachment without broad DB mutation.
- Only wire a retry-parsing fallback if rhwp extracts meaningful text from a real sample.
- Keep broad crawl/parse/embedding recovery out of scope.
- Verify focused tests and TypeScript typecheck.

Working Notes:
- Current parser path: scripts/retry-parsing.ts -> src/lib/document-parser.ts -> worker.jerome87.com text_parser.
- Current blocker: worker parser reaches HWP/HWPX samples but returns no text for selected small files.
- Existing local crawler fallback lives in src/lib/crawler/worker.ts and is not used by retry-parsing.ts.
- rhwp appears Rust/WASM based; first step is API/package verification, not integration.

Tasks:
- [x] Check rhwp package/API availability and license from npm/GitHub without changing dependencies.
- [x] Find one real failed HWP/HWPX attachment candidate that is small, parseable, and has a downloadable/storage buffer.
- [x] Create a throwaway local spike script or command to run rhwp on that buffer without DB writes.
- [x] If rhwp extracts >= 50 chars, add a focused local parser helper with a failing test first.
- [x] Wire helper into retry-parsing fallback only after the helper passes with sample-like input.
- [x] Run `corepack pnpm test -- __tests__/scripts/retry-parsing-selection.test.ts __tests__/lib/project-analyzer.test.ts`.
- [x] Run `npx tsc --noEmit`.
- [x] Run one `RETRY_PARSE_MAX_FILES=1` preflight and compare read-only crawl status.

Results:
- Confirmed `@rhwp/core@0.7.8` is MIT-licensed and exposes `HwpDocument` with page layout/text-capable APIs.
- Read-only spike on failed sample `붙임4.강의계획서.hwp` extracted 1,955 raw chars; installed helper extracted 476 cleaned chars from the same real sample.
- Added `src/lib/rhwp-parser.ts` and wired HWP/HWPX-only fallback into `scripts/retry-parsing.ts` after worker no-text/failure paths.
- Focused tests passed: `__tests__/scripts/retry-parsing-selection.test.ts`, `__tests__/lib/project-analyzer.test.ts`, `__tests__/lib/rhwp-parser.test.ts`.
- `npx tsc --noEmit` passed.
- `RETRY_PARSE_MAX_FILES=1 npx tsx scripts/retry-parsing.ts` processed one HWP successfully; direct attachment check shows `isParsed=true`, `parseError=null`, `parsedChars=488`.

---

# 경기콘텐츠진흥원 Crawler Implementation Plan

Goal: Add a first regional content promotion agency crawler for 경기콘텐츠진흥원 사업공고, then verify it through the existing FlowMate crawl and AI analysis pipeline.

Acceptance criteria:
- Detect `gcon.or.kr` as a content agency source without affecting existing Bizinfo, K-Startup, and Technopark crawlers.
- Crawl `https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061` and parse recent business notices into `CrawledProject` records.
- Preserve existing detail page and attachment extraction pipeline.
- Add focused tests for the GCON list parser and pagination URL builder.
- Run focused tests and TypeScript typecheck.
- Register the GCON source in DB only after parser tests pass, then run one source-specific crawl job and verify DB output.

Working Notes:
- Existing router path: `crawlAndParse()` → `detectSiteType()` → `parseHtmlContentWithDateFilter()` in `src/lib/crawler/worker.ts`.
- GCON business notice list URL discovered from the main page: `/gcon/business/gconNotice/list.do?menuNo=200061`.
- Keep source scope to 경기콘텐츠진흥원 first; do not add nationwide content agency sources yet.
- Do not create `/docs` plan/spec files for this task.

Tasks:
- [x] Create a small exported parser module for content agency boards with GCON-specific parsing and pagination helpers.
- [x] Add fixture-based unit tests for GCON list parsing and page URL generation.
- [x] Wire `gcon.or.kr` into `worker.ts` site detection, pagination, and parser dispatch.
- [x] Run focused parser tests.
- [x] Run `npx tsc --noEmit`.
- [x] Register or update the 경기콘텐츠진흥원 `CrawlSource` row with `type=web` and the business notice list URL.
- [x] Run one source-specific crawl job for GCON and verify `CrawlJob` stats plus saved `SupportProject` rows.
- [x] Trigger one AI analysis batch if new/updated GCON projects need analysis, then verify `analysisStatus`, `analysisConfidence`, `descriptionMarkdown`, and `projectAnalysis`.

Results:
- Added `src/lib/crawler/content-agency-parser.ts` with GCON pagination and table-row parsing, plus fixture coverage in `__tests__/lib/content-agency-parser.test.ts`.
- Wired `gcon.or.kr` into `src/lib/crawler/worker.ts` as `contentAgency` without changing Bizinfo, K-Startup, or Technopark dispatch.
- Verified `corepack pnpm test -- __tests__/lib/content-agency-parser.test.ts` and `npx tsc --noEmit` pass.
- Registered `CrawlSource` for `https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061` with `type=web`; left `isActive=false` because the parser code is local/uncommitted and not deployed to OCI yet.
- Ran one local source-specific crawl job with `TEST_MAX_PROJECTS=3`: `CrawlJob cmoma7yyg0001wwkc0pnyznmb` completed, found 31 projects, saved 3 new GCON rows.
- Ran AI analysis for the 3 saved GCON rows: 3/3 succeeded; all have `analysisStatus=analyzed`, `analysisConfidence=medium`, `descriptionMarkdown`, and `projectAnalysis`.

---

# Project Detail AI Summary Update

Goal: Show richer public AI analysis on project detail pages and remove expand/collapse from the analysis markdown.

Acceptance criteria:
- AI summary shows available key points, benefits, and evaluation points from existing public analysis data.
- Support conditions show required, preferred, excluded, and ambiguous groups when available.
- Preparation tips show available recommendation, priority, strategy, risk, checklist, document, and evaluation arrays.
- Project analysis markdown is displayed in full without `더 보기` or `접기` controls.
- New analysis defaults produce useful `summary.keyPoints` and `aiTips.checklist` from existing project fields.

Working Notes:
- Public DTO/schema boundaries remain unchanged; internal evidence and warnings are still stripped by existing serializers.
- Local browser verification used `/projects/cmolqxt6z1guvqq0z6ezsaqnc`.
- Local dev console showed existing manifest CORS errors from `manifest.webmanifest` redirecting to production login; detail page UI still rendered correctly.

Tasks:
- [x] Add failing regression tests for analyzer defaults and markdown renderer controls.
- [x] Remove expand/collapse state, gradient, and buttons from `ProjectDescriptionRenderer`.
- [x] Expand `/projects/[id]` AI summary, support condition, and preparation tip rendering.
- [x] Add analyzer helper defaults for key points and checklist fallback.
- [x] Run focused tests, typecheck, build, and browser verification.

Results:
- `corepack pnpm test -- __tests__/lib/project-analyzer.test.ts __tests__/components/projects/project-description-renderer.test.tsx __tests__/lib/projects/public-dto.test.ts __tests__/lib/projects/analysis-schema.test.ts` passed: 24 tests.
- `npx tsc --noEmit` passed.
- `corepack pnpm build` passed with pre-existing lint warnings outside this change.
- Browser verification confirmed AI 요약/지원 조건/준비 팁 sections render and no `더 보기`/`접기` text appears.

---

# Support Search Analysis Improvement

Results:
- Added attachment document intelligence metadata and deterministic classification.
- Added group-aware analysis input for confirmed duplicate groups with pending/rejected group fallback.
- Strengthened selection criteria with optional score table and priority signal output.
- Added crawl diagnostics metrics for current source coverage.
- Rendered public detail score tables and priority signals when available.
- Verification: focused Jest passed (62 tests), full Jest passed (183 tests), `npx tsc --noEmit` passed.
- Final review fixes: low-quality evaluation documents no longer drive score table extraction, and pending/rejected duplicate groups use current-project-only attachments.
- Final regression verification: `npx pnpm@9.15.3 test -- __tests__/lib/projects/attachment-intelligence.test.ts __tests__/lib/project-analyzer.test.ts` passed (35 tests), `npx tsc --noEmit` passed, final re-review approved.
- Browser verification: existing public detail page rendered normally; no current public DB record has score table rows, so the score table branch is covered by fixture render test.
- DB rollout: `npx prisma db push` completed successfully after explicit approval and regenerated Prisma Client.
- Build after DB rollout: `npx pnpm@9.15.3 build` completed route generation successfully; the previous `/admin/crawler` prerender failure from missing `CrawlJob.metrics` is resolved. Build output still reports the pre-existing Next ESLint plugin conflict warning.
- Post-rollout verification: full Jest passed (`npx pnpm@9.15.3 test`, 185 tests) and `npx tsc --noEmit` passed.

---

# Operations Stabilization Plan

Goal: Safely clean stale operational crawl state, reduce recurrence risk, and align worker observability after the production health check.

Acceptance criteria:
- Only stale `CrawlJob.status=running` rows with clear age evidence are mutated.
- No active crawler work is interrupted before confirming process state.
- Add source-level protection so cron does not enqueue duplicate active crawl jobs for the same source.
- Verify changed TypeScript with focused tests/typecheck where practical.
- Record what was changed and how it was verified.

Working Notes:
- Public app and `/api/v1/*` are healthy.
- Embedding, analysis, and matching workers are processing successfully; backlog is throughput mismatch, not worker failure.
- Crawler has seven stale `running` jobs aged 10.6h–154.6h with zero project counters.
- Crawler container has a 6+ day old Playwright `headless_shell`, contributing to high RSS.
- Host nginx is missing repo-configured stats routes, while container-local authenticated stats endpoints work.

Tasks:
- [x] Re-check current running crawl jobs and crawler process state.
- [x] Mark clearly stale running crawl jobs as failed with an operational cleanup message.
- [x] Add duplicate active crawl-job skip logic to cron crawl dispatch.
- [x] Verify source-level lock behavior with tests or typecheck.
- [x] Restart crawler only after DB state cleanup and active-process check.
- [x] Decide and apply nginx stats route alignment if safe.
- [x] Increase analysis and embedding batch sizes conservatively.
- [x] Summarize changes and verification story.

Results:
- Production DB cleanup marked 7 stale `running` crawl jobs as `failed`; remaining running crawl jobs: 0.
- Restarted `flowmate-crawler`; health returned `ok` and RSS dropped to about 153MB.
- Added crawl scheduling helper to clean stale running jobs over 12h and skip sources with existing `pending/running` jobs before enqueue.
- Increased cron dispatch batch sizes: analysis 50→100 and embeddings 50→500.
- Aligned repo nginx config with current safer operation by keeping stats routes internal-only externally (`/embedding-stats` and `/analysis-stats` return 404).
- Verification passed: `npm test -- __tests__/lib/crawler/job-scheduler.test.ts`, `npx tsc --noEmit`, and `npm run build`.
- Build still reports pre-existing lint warnings unrelated to this change.

---

# Stale Pending Crawl Job Cleanup Results

- Added automatic cleanup for crawl jobs stuck in `pending` for more than 12 hours.
- Wired cleanup into `/api/cron/crawl-all` before source scheduling so old queue items cannot block active sources.
- Verification:
  - `npm test -- __tests__/lib/crawler/job-scheduler.test.ts`: PASS
  - `npx tsc --noEmit`: PASS
  - Production read-only blocker check: PASS (`activeSources=24`, `activeJobBlockers=0`)
