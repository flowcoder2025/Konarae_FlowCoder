# Public Board Launch Hardening Design

## Goal

Harden the public support-project board for initial launch without broad refactoring. The work focuses on four launch risks identified during review: public API abuse, sitemap database load, low-confidence AI analysis presentation, and silent internal API misconfiguration.

## Scope

Implement the minimal operational hardening needed before public traffic:

1. Apply IP-based rate limiting to public `/api/v1/*` endpoints.
2. Cache and cap dynamic sitemap project entries.
3. Show a clear low-confidence AI warning on public project detail pages.
4. Make missing `INTERNAL_API_KEY` observable while preserving deny-by-default behavior.

Out of scope:

- API gateway or middleware rewrite.
- Sitemap index/chunked sitemap architecture.
- Changing publication policy for low-confidence projects.
- Startup hard-fail for missing internal API key.
- Broad UI redesign or authenticated workflow changes.

## Current Context

The public board implementation is already present on `main`:

- Public pages: `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`.
- Public API: `src/app/api/v1/projects`, `src/app/api/v1/projects/[id]`, `src/app/api/v1/projects/[id]/analysis`, `src/app/api/v1/categories`, `src/app/api/v1/regions`.
- Public DTO/service boundary: `src/lib/projects/public-dto.ts`, `src/lib/projects/public-service.ts`.
- Internal API guard: `src/lib/internal-api.ts`.
- Cache/rate limit utility: `src/lib/cache.ts`.
- Dynamic sitemap: `src/app/sitemap.ts`.

Existing verification records show public DTO boundary tests and public HTTP smoke checks passed, but operational hardening remains incomplete.

## Architecture

### Public API Rate Limiting

Add a small reusable public API rate-limit helper that wraps the existing Redis-backed `rateLimit()` utility from `src/lib/cache.ts`.

Use this explicit helper contract:

```ts
export async function enforcePublicApiRateLimit(
  request: Request,
  options?: { limit?: number; windowSeconds?: number }
): Promise<{ response: Response | null; headers: HeadersInit }>;
```

The helper should:

- Accept the standard Web `Request` type so it works for both existing `NextRequest` and plain `Request` route handlers.
- Derive a client identifier from request headers, preferring the first value in `x-forwarded-for`, then `x-real-ip`, then `unknown`.
- Pass `public-api:<identifier>` to `rateLimit()`; the final Redis key will be `ratelimit:public-api:<identifier>` because `rateLimit()` adds the `ratelimit:` prefix internally.
- Use a default budget of `120 requests / 60 seconds / client`.
- Return `{ response: null, headers }` when the request is allowed.
- Return `{ response, headers }` where `response` is a `429` JSON response when the request is blocked.

Apply the helper to all public API routes under `/api/v1`:

- `GET /api/v1/projects`
- `GET /api/v1/projects/[id]`
- `GET /api/v1/projects/[id]/analysis`
- `GET /api/v1/categories`
- `GET /api/v1/regions`

Routes that currently do not accept a request parameter must add `request: Request` so the helper can read headers. Allowed responses should include the returned rate-limit headers. Blocked responses should return the helper's `429` response before any DB work.

Header behavior must align with the existing project pattern in `src/app/api/evaluations/route.ts`:

- Allowed responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- Blocked responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- The blocked JSON body is `{ "error": "Too many requests", "message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", "retryAfter": <seconds> }`.

Redis misconfiguration or Redis runtime errors should keep the existing fail-open behavior from `rateLimit()` to avoid launch outages.

### Sitemap Caching and Cap

Update `src/app/sitemap.ts` so the dynamic project sitemap query is cached and bounded.

Use Next.js route-level caching for the sitemap:

- Replace `export const dynamic = "force-dynamic"` with `export const revalidate = 600`.
- Do not use Redis `getCached()` for sitemap caching; Redis absence should not disable the sitemap cache.

Requirements:

- Keep static pages unchanged.
- Cache project sitemap entries for 10 minutes through `revalidate = 600`.
- Read `SITEMAP_PROJECT_LIMIT` from env.
- Default to `5000` project URLs when env is missing or invalid.
- Clamp positive values to `1..50000`.
- Treat `SITEMAP_PROJECT_LIMIT=0` as an explicit request to return no project URLs while still returning static pages.
- Keep visibility rules aligned with `public-service.ts`: `deletedAt: null`, `publicationStatus: "visible"`, and canonical/ungrouped filtering.
- Preserve `updatedAt desc` ordering.

Sitemap index/chunking is deferred until the project count exceeds this cap or SEO requirements demand full indexing.

### Low-Confidence AI Warning

Update the public project detail page to show a clear warning when `project.trust.confidence === "low"`.

Requirements:

- Do not block page rendering.
- Do not change project publication behavior.
- Place the warning near the AI summary so users see it before relying on AI-generated analysis.
- Use concise Korean copy: `AI 분석 신뢰도가 낮아 원문 확인이 필요합니다.`
- Show the warning only for `project.trust.confidence === "low"`; do not show it for `null` confidence or unanalyzed projects.
- Extract the warning decision into a small pure helper or component so automated test coverage is practical.
- Avoid adding complex UI state or new dependencies.

### Internal API Key Observability

Preserve current security behavior: if `INTERNAL_API_KEY` is missing, internal API requests remain unauthorized.

Add observability:

- Log a warning when `isValidInternalRequest()` is called without configured `INTERNAL_API_KEY`.
- Keep response status as `401` through existing `unauthorizedInternalResponse()`.
- Add explicit test coverage for `INTERNAL_API_KEY` being undefined: delete the env var, call `isValidInternalRequest()`, expect `false`, and assert that the warning path is exercised.

Startup hard-fail is intentionally excluded to avoid breaking preview or partial environments during this hardening slice.

## Data Flow

### Public API Request

```text
request
  -> enforcePublicApiRateLimit(request)
  -> blocked: return helper 429 JSON with Retry-After and X-RateLimit-* headers
  -> allowed: execute existing route service logic and include helper X-RateLimit-* headers
```

### Sitemap Request

```text
sitemap()
  -> Next.js revalidates this route every 600 seconds
  -> build static page entries
  -> fetch bounded project entries unless SITEMAP_PROJECT_LIMIT=0
  -> return static entries + project entries
```

### Project Detail Rendering

```text
getPublicProject(id)
  -> render existing detail sections
  -> if trust.confidence === "low", render AI confidence warning near AI summary
```

### Internal API Request

```text
request
  -> isValidInternalRequest(request)
  -> env missing: log warning and return false
  -> invalid key: return false
  -> valid key: return true
```

## Error Handling

- Public rate limit Redis unavailable: allow request using existing `rateLimit()` fail-open behavior and log through cache utility.
- Public rate limit exceeded: return `429` with JSON body `{ "error": "Too many requests", "message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", "retryAfter": <seconds> }`, `Retry-After`, and `X-RateLimit-*` headers.
- Sitemap DB query failure: allow Next.js to surface the error rather than returning a misleading empty sitemap.
- Invalid `SITEMAP_PROJECT_LIMIT`: use default `5000`.
- `SITEMAP_PROJECT_LIMIT=0`: return only static sitemap entries.
- Missing `INTERNAL_API_KEY`: log warning, deny request with existing `401` path.

## Testing Plan

Automated tests:

- Add unit coverage for the public API rate-limit helper in a dedicated test file such as `__tests__/lib/public-api-rate-limit.test.ts`:
  - allowed result returns `response: null` and success headers.
  - blocked result returns `429`, `Retry-After`, and `X-RateLimit-*` headers.
  - client identifier handles `x-forwarded-for`, `x-real-ip`, and fallback.
  - mock `rateLimit` from `src/lib/cache.ts` rather than relying on module-load Redis env state.
- Add unit coverage for sitemap limit parsing helper in a dedicated test file such as `__tests__/app/sitemap.test.ts` or a lib-level helper test:
  - missing/invalid env uses default.
  - positive values outside bounds are clamped.
  - `0` returns no project entries.
- Extend `__tests__/lib/internal-api.test.ts`:
  - configured key with missing header still rejects.
  - undefined `INTERNAL_API_KEY` still rejects and exercises the warning path.
  - valid key still accepts.
- Add focused test coverage for the low-confidence warning helper/component:
  - `"low"` returns/renders the warning.
  - `null`, `"medium"`, and `"high"` do not.

Verification commands:

```bash
pnpm test -- __tests__/lib/public-api-rate-limit.test.ts __tests__/lib/internal-api.test.ts __tests__/app/sitemap.test.ts __tests__/components/projects/project-analysis-confidence-warning.test.tsx
pnpm build
```

Manual or smoke verification:

- Start local dev server if build succeeds.
- Confirm `/projects/[id]` renders the low-confidence warning for a seeded or mocked low-confidence project if one is available.
- Confirm public API still returns normal responses below the limit.
- Confirm blocked response shape in a targeted script or test without stressing the server.

## Acceptance Criteria

- All `/api/v1/*` route handlers enforce `enforcePublicApiRateLimit(request)` before DB work.
- Allowed public API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- A blocked public API request returns HTTP `429` with `Retry-After` and `X-RateLimit-*` headers.
- Sitemap project entries are cached for 10 minutes with `revalidate = 600` and capped by a parsed safe limit.
- `SITEMAP_PROJECT_LIMIT=0` returns only static sitemap entries.
- Low-confidence AI analysis is visibly marked on the project detail page and covered by a focused helper/component test.
- Missing `INTERNAL_API_KEY` remains deny-by-default and creates an operator-visible warning covered by test.
- Relevant unit tests pass.
- `pnpm build` passes or any blocker is recorded with exact error output and next action.
