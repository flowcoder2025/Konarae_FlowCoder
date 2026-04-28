# Public Board Boundary Verification

## Goal
Verify the public support-project board/API artifacts now present on `origin/main` without mutating the remote database.

## Acceptance Criteria
- [x] Verify `origin/main` contains public board/API artifacts.
- [x] Verify Prisma schema contains public analysis/publication columns locally.
- [x] Install dependencies in the isolated worktree without changing lockfiles.
- [x] Run public DTO/query/schema/internal API tests.
- [x] Run build or document blocker.
- [x] If safe, perform read-only public API/service smoke checks against the configured DB without printing credentials.
- [x] Record final result and blockers.

## Working Notes
- Worktree: `/Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary`
- Branch: `verify/public-board-boundary`
- Base: `origin/main` at `a4345fd WI-001-feat 지원사업 보드 공개 전환 (#1)`
- Remote DB mutations are out of scope; only read-only checks are allowed.
- The previous blocker was local artifact absence. This worktree has the artifacts from `origin/main`.

## Results
- Artifact presence: PASS — `src/app/projects`, `src/app/api/v1`, and `src/app/api/internal` are present on `origin/main`.
- Local schema columns: PASS — `projectAnalysis`, `analysisStatus`, `analysisConfidence`, `hasParsedAttachment`, `hasSelectionCriteria`, and `publicationStatus` exist in `prisma/schema.prisma`.
- Dependency install: PASS — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary install --frozen-lockfile` completed and generated Prisma Client without lockfile changes.
- Unit tests: PASS — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary exec jest __tests__/lib/projects/public-dto.test.ts __tests__/lib/projects/public-query.test.ts __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/internal-api.test.ts --runInBand` passed 4 suites / 26 tests. Next.js emitted a multiple-lockfile workspace-root warning because this is a nested git worktree.
- Build: PASS_WITH_WARNING — `bash -lc 'set -a; source "/Users/jerome/DEV/FlowMate/.env.local"; set +a; corepack pnpm --dir "/Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary" build'` compiled successfully, generated 71 static pages, and included `/projects`, `/projects/[id]`, `/api/v1/projects`, `/api/v1/projects/[id]`, `/api/v1/projects/[id]/analysis`, `/api/v1/categories`, and `/api/v1/regions`. Warnings: Next.js inferred root from the parent lockfile, and ESLint could not load `next/core-web-vitals` from the parent `.eslintrc.json`; the build still completed.
- Read-only public service smoke: PASS — `tasks/tmp/public-service-smoke.ts` queried the configured DB through `listPublicProjects`, `listPublicCategories`, and `listPublicRegions` without mutations. Result: `projectsReturned=2`, `total=5525`, `categoriesReturned=12`, `regionsReturned=18`, `forbiddenHits=[]`.
- Dev server: PASS_WITH_WARNING — `corepack pnpm --dir /Users/jerome/DEV/FlowMate/.worktrees/public-board-boundary dev --hostname 127.0.0.1 --port 3100` became ready at `http://127.0.0.1:3100`; same nested-worktree multiple-lockfile warning appeared.
- HTTP public boundary smoke: PASS — `tasks/tmp/public-http-smoke.ts` checked `/projects`, `/api/v1/projects?limit=2&sort=latest`, `/api/v1/categories`, `/api/v1/regions`, `/api/v1/projects/cmo7cdqr20q3gqq0zbm5g0zeg`, and `/api/v1/projects/cmo7cdqr20q3gqq0zbm5g0zeg/analysis`. All returned HTTP 200, `/projects` contained the public board title, `projectsReturned=2`, and `forbiddenHits=[]`.
- Browser check: SKIPPED_WITH_SUBSTITUTE — Playwright MCP backend was already closed (`Target page, context or browser has been closed`), so deterministic HTTP smoke against the running dev server was used instead.

## Final Verification Summary
- Final status: PASS_WITH_WARNINGS.
- The earlier blocker is resolved on `origin/main`: public board/API artifacts exist in the checked-out `a4345fd` worktree.
- The configured DB is schema-compatible with the public board columns and returned public project data through read-only service and HTTP checks.
- Public DTO/API boundary did not expose forbidden internal keys in unit, service, or HTTP smoke checks.
- Warnings: nested worktree causes Next.js multiple-lockfile workspace-root warning; build prints an ESLint config warning for `next/core-web-vitals` from the parent `.eslintrc.json`, but compilation and route generation completed.
