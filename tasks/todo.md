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
