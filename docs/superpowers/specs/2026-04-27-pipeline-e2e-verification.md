# Pipeline E2E Verification Design

## Goal
Verify the support-project pipeline end to end with the smallest safe blast radius: existing DB project dry verification first, then one controlled real crawl, then public-safe board/API checks after the public board merge is present locally.

## Scope
- Verify crawl → attachment parse/content persistence → AI analysis → persisted analysis fields → public board/API output.
- Start with an existing `SupportProject` row to isolate AI analysis and persistence from crawler/network failures.
- Run a real crawl only with `TEST_MAX_PROJECTS=1` after the dry verification path is understood.
- Do not perform destructive DB cleanup, schema redesign, broad crawler refactors, or multi-source crawling.

## Current Context
The current shell is inside `/Users/jerome/DEV/FlowMate/.worktrees/support-board-redesign`, but Git reports `/Users/jerome/DEV/FlowMate` as the top-level repository. The local `main` observed during planning does not yet show the public board merge artifacts (`src/app/api/v1`, `src/app/api/internal`, or `projectAnalysis` schema fields), so verification must begin with a repo sync/state check before relying on those surfaces.

## Recommended Approach
Use staged verification.

1. **Preflight repository, environment, and DB target**
   - Confirm current Git root, branch, and upstream status.
   - Check whether the public board merge commit and schema/API files exist locally.
   - Inspect required environment variables without printing secret values.
   - Identify the `DATABASE_URL` host/database name without printing credentials. If it points at production, stop and ask for explicit approval before any DB mutation.
   - Confirm Prisma client/schema state before running analysis.
   - Locate existing invocation paths for `analyzeProject(projectId)` and `processCrawlJob(jobId)`; prefer existing scripts/routes/actions and use a temporary `tsx` one-liner only if there is no safer entrypoint.

2. **Dry verification on existing data**
   - Pick one `SupportProject` candidate with `deletedAt IS NULL` and enough crawled text: non-empty `description`, or several of `summary`, `target`, `eligibility`, `applicationProcess`, and `evaluationCriteria` populated.
   - Prefer a project with at least one `ProjectAttachment.isParsed = true` row; if none exists, record that attachment integration could not be covered by the dry run.
   - Snapshot before-state for `id`, `analysisVersion`, `analyzedAt`, `needsAnalysis`, `needsEmbedding`, `descriptionMarkdown` existence/length, and `eligibilityCriteria` existence.
   - Run the existing analyzer for that single explicit project ID only.
   - Verify expected mutations: `descriptionMarkdown` is non-empty, `analysisVersion` increments by one, `analyzedAt` updates, `needsAnalysis` becomes false, `needsEmbedding` becomes true, and `eligibilityCriteria` is set when extractable.
   - If public board fields exist locally, also verify `projectAnalysis`, `analysisStatus`, `analysisConfidence`, `hasParsedAttachment`, `hasSelectionCriteria`, and `publicationStatus`.
   - Do not run broad `needsAnalysis=true` batch analysis until single-project verification passes.

3. **Controlled real crawl**
   - Create or select one active `CrawlSource` and one crawl job, preferring the smallest known source or an already verified rate-limit-friendly source.
   - Run the crawler with `TEST_MAX_PROJECTS=1`, understanding that this limits persisted/processed projects after source discovery; the crawler may still fetch and parse the listing page before slicing.
   - Verify the job status, `projectsFound`, `projectsNew`, `projectsUpdated`, created/updated project ID, attachment records, parse status, and any analysis trigger state separately.
   - Then run analysis for at most one crawled/updated project if the crawler did not already do so.

4. **Public-safe output checks**
   - If public board/API files are present locally, start the app and check `/projects`, `/projects/[id]`, `/api/v1/projects`, `/api/v1/projects/[id]`, and `/api/v1/projects/[id]/analysis`.
   - Confirm unauthenticated public API requests succeed, internal API routes remain protected, and unpublished/deleted/private records are not exposed.
   - Confirm public DTOs exclude raw attachment parsed text, raw AI prompt/evidence text, crawl source internals, internal job IDs, debug data, and user/session/company/matching private data.
   - Use browser/manual checks for UI and direct HTTP/API checks for DTO boundaries.
   - If public board files are not present, record the blocker as “local main not synced to merged public board state” and stop before claiming that public output was verified.

## Error Handling
- If repo state does not contain the merged public board work, stop and sync instead of fabricating checks against missing files.
- If DB schema is behind, stop before running pipeline code that depends on missing columns.
- If the DB target is production, stop before mutation unless the user explicitly approves production verification.
- If crawl fails due to site blocking or network issues, preserve the failing source/job evidence and keep dry verification results separate.
- If AI quota or provider errors occur, retry only when the error includes a safe retry delay; otherwise record the blocker and avoid broad retries.
- Do not attempt rollback by default. Treat analysis/crawl writes as intentional verification evidence; if rollback is required, ask before making further DB changes.

## Verification Evidence
Capture:
- Git branch/status and merge artifact presence.
- DB target identity at host/database level only, with credentials redacted.
- Project ID used for dry verification.
- Crawl job ID and source ID used for controlled crawl.
- Before/after field checks for analysis persistence.
- `projectsFound`, `projectsNew`, `projectsUpdated`, and attachment parse counts for the controlled crawl.
- API/UI checks performed and whether public-safe DTO boundaries passed.
- Commands run: repo/schema checks, candidate selection query, targeted analyzer invocation, controlled crawler invocation, public API/UI checks, `pnpm lint`, relevant Jest tests, and `pnpm build` when required.

## Verification Command Policy
- Spec-only changes do not require app tests.
- Before pipeline execution, run Prisma/schema/client checks sufficient to ensure the local code matches the target DB schema.
- After any application code change, run `pnpm lint`, relevant Jest tests, and `pnpm build` unless a blocker makes one impossible.
- For DB-only verification with no code changes, targeted script success plus before/after DB evidence is acceptable; record why lint/build were not repeated.
- If public board/API artifacts exist and are checked locally, run `pnpm build` or record a concrete blocker and substitute with the narrowest reliable alternative.

## Acceptance Criteria
- The DB target is identified, and production mutation is not performed without explicit approval.
- One existing project has analysis run and persisted as expected for the currently available schema.
- The dry verification uses exactly one explicit project ID and does not run broad batch analysis.
- One controlled crawl persists/processes at most one project and records discovery, parse, attachment, and job outcomes separately.
- AI analysis is limited to at most one dry-run project and at most one crawled/updated project.
- Public board/API exposure is verified if the merged public board code is present locally; otherwise the missing local merge state is explicitly reported as a blocker.
- No destructive DB or Git operation is performed.
- Verification results clearly distinguish dry verification, real crawl verification, and public-safe output verification.
