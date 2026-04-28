# Public Board Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the public support-project board for launch with public API rate limiting, cached/capped sitemap generation, low-confidence AI warning UX, and observable internal API key misconfiguration.

**Architecture:** Add small focused helpers instead of introducing middleware or a gateway. Public API routes call a reusable rate-limit guard before DB work, sitemap uses Next.js route revalidation plus a tested limit parser, low-confidence rendering is isolated in a tiny component, and internal API auth keeps deny-by-default behavior while logging missing configuration.

**Tech Stack:** Next.js App Router, TypeScript, Jest, React Testing Library, Prisma, existing Upstash Redis-backed `rateLimit()` utility.

---

## Source Spec

Implement the accepted design in:

- `docs/superpowers/specs/2026-04-28-public-board-launch-hardening-design.md`

Do not broaden scope beyond that spec.

## File Structure

### Create

- `src/lib/public-api-rate-limit.ts` — public API rate-limit guard that accepts Web `Request`, calls `rateLimit()`, and returns `{ response, headers }`.
- `__tests__/lib/public-api-rate-limit.test.ts` — unit tests for allowed/blocked responses and client identifier extraction.
- `src/lib/projects/sitemap.ts` — pure sitemap project limit parser constants/helper.
- `__tests__/app/sitemap.test.ts` — unit tests for sitemap limit parsing.
- `src/components/projects/project-analysis-confidence-warning.tsx` — pure warning decision helper and small presentation component.
- `__tests__/components/projects/project-analysis-confidence-warning.test.tsx` — helper/component tests.

### Modify

- `src/app/api/v1/projects/route.ts` — enforce public rate limit before `listPublicProjects()`.
- `src/app/api/v1/projects/[id]/route.ts` — enforce public rate limit before `getPublicProject()`.
- `src/app/api/v1/projects/[id]/analysis/route.ts` — enforce public rate limit before `getPublicProject()`.
- `src/app/api/v1/categories/route.ts` — add `request: Request` and enforce public rate limit before `listPublicCategories()`.
- `src/app/api/v1/regions/route.ts` — add `request: Request` and enforce public rate limit before `listPublicRegions()`.
- `src/app/sitemap.ts` — replace `force-dynamic` with `revalidate = 600`, apply sitemap limit parser, add `take` cap.
- `src/app/projects/[id]/page.tsx` — render low-confidence warning near the AI summary.
- `src/lib/internal-api.ts` — log when `INTERNAL_API_KEY` is missing.
- `__tests__/lib/internal-api.test.ts` — add undefined-env warning-path coverage.

### Do Not Modify

- Prisma schema.
- Public DTO field shape.
- Publication policy for low-confidence projects.
- Auth middleware behavior outside `/api/v1/*` and internal API key observability.

---

## Task 1: Public API Rate-Limit Helper

**Files:**
- Create: `src/lib/public-api-rate-limit.ts`
- Test: `__tests__/lib/public-api-rate-limit.test.ts`

- [ ] **Step 1: Write the failing public API rate-limit tests**

Create `__tests__/lib/public-api-rate-limit.test.ts` with this content:

```ts
import { rateLimit } from "@/lib/cache";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

jest.mock("@/lib/cache", () => ({
  rateLimit: jest.fn(),
}));

const mockedRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

describe("enforcePublicApiRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows requests and returns rate-limit headers", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 119, reset: 1777344000000 });

    const result = await enforcePublicApiRateLimit(
      new Request("https://example.com/api/v1/projects", {
        headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
      })
    );

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:203.0.113.10", 120, 60);
    expect(result.response).toBeNull();
    expect(result.headers).toEqual({
      "X-RateLimit-Limit": "120",
      "X-RateLimit-Remaining": "119",
      "X-RateLimit-Reset": "1777344000",
    });
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 1777344000000 });

    await enforcePublicApiRateLimit(
      new Request("https://example.com/api/v1/categories", {
        headers: { "x-real-ip": "198.51.100.20" },
      }),
      { limit: 20, windowSeconds: 30 }
    );

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:198.51.100.20", 20, 30);
  });

  it("uses unknown identifier when no client IP headers exist", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 1777344000000 });

    await enforcePublicApiRateLimit(new Request("https://example.com/api/v1/regions"));

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:unknown", 120, 60);
  });

  it("returns 429 response with Retry-After and X-RateLimit headers when blocked", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1777343990000);
    mockedRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 1777344000000 });

    const result = await enforcePublicApiRateLimit(new Request("https://example.com/api/v1/projects"));

    expect(result.response).not.toBeNull();
    expect(result.headers).toEqual({
      "X-RateLimit-Limit": "120",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1777344000",
    });
    expect(result.response!.status).toBe(429);
    expect(result.response!.headers.get("Retry-After")).toBe("10");
    expect(result.response!.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(result.response!.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(result.response!.headers.get("X-RateLimit-Reset")).toBe("1777344000");
    await expect(result.response!.json()).resolves.toEqual({
      error: "Too many requests",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      retryAfter: 10,
    });

    nowSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- __tests__/lib/public-api-rate-limit.test.ts
```

Expected: FAIL because `@/lib/public-api-rate-limit` does not exist.

- [ ] **Step 3: Create the minimal helper implementation**

Create `src/lib/public-api-rate-limit.ts` with this content:

```ts
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/cache";

const DEFAULT_PUBLIC_API_LIMIT = 120;
const DEFAULT_PUBLIC_API_WINDOW_SECONDS = 60;

export interface PublicApiRateLimitOptions {
  limit?: number;
  windowSeconds?: number;
}

export interface PublicApiRateLimitResult {
  response: Response | null;
  headers: HeadersInit;
}

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(",")[0]?.trim();
    if (firstForwardedIp) return firstForwardedIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

function buildRateLimitHeaders(limit: number, remaining: number, reset: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
  };
}

export async function enforcePublicApiRateLimit(
  request: Request,
  options: PublicApiRateLimitOptions = {}
): Promise<PublicApiRateLimitResult> {
  const limit = options.limit ?? DEFAULT_PUBLIC_API_LIMIT;
  const windowSeconds = options.windowSeconds ?? DEFAULT_PUBLIC_API_WINDOW_SECONDS;
  const identifier = getClientIdentifier(request);
  const result = await rateLimit(`public-api:${identifier}`, limit, windowSeconds);
  const headers = buildRateLimitHeaders(limit, result.remaining, result.reset);

  if (result.success) {
    return { response: null, headers };
  }

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));

  return {
    headers,
    response: NextResponse.json(
      {
        error: "Too many requests",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(retryAfter),
        },
      }
    ),
  };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- __tests__/lib/public-api-rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect the diff**

Run:

```bash
git diff -- src/lib/public-api-rate-limit.ts __tests__/lib/public-api-rate-limit.test.ts
```

Expected: only the helper and its tests are present. Do not commit unless the user explicitly asks.

---

## Task 2: Apply Rate Limit to Public API Routes

**Files:**
- Modify: `src/app/api/v1/projects/route.ts`
- Modify: `src/app/api/v1/projects/[id]/route.ts`
- Modify: `src/app/api/v1/projects/[id]/analysis/route.ts`
- Modify: `src/app/api/v1/categories/route.ts`
- Modify: `src/app/api/v1/regions/route.ts`
- Test: `__tests__/lib/public-api-rate-limit.test.ts`

- [ ] **Step 1: Update `src/app/api/v1/projects/route.ts`**

Replace the file content with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { parsePublicProjectQuery } from "@/lib/projects/public-query";
import { listPublicProjects } from "@/lib/projects/public-service";

export async function GET(request: NextRequest) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const query = parsePublicProjectQuery(request.nextUrl.searchParams);
  const result = await listPublicProjects(query);
  return NextResponse.json(result, { headers: rateLimitResult.headers });
}
```

- [ ] **Step 2: Update `src/app/api/v1/projects/[id]/route.ts`**

Replace the file content with:

```ts
import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { getPublicProject } from "@/lib/projects/public-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const { id } = await params;
  const project = await getPublicProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: rateLimitResult.headers });
  }

  return NextResponse.json({ project }, { headers: rateLimitResult.headers });
}
```

- [ ] **Step 3: Update `src/app/api/v1/projects/[id]/analysis/route.ts`**

Replace the file content with:

```ts
import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { getPublicProject } from "@/lib/projects/public-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const { id } = await params;
  const project = await getPublicProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: rateLimitResult.headers });
  }

  return NextResponse.json({ analysis: project.analysis }, { headers: rateLimitResult.headers });
}
```

- [ ] **Step 4: Update `src/app/api/v1/categories/route.ts`**

Replace the file content with:

```ts
import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { listPublicCategories } from "@/lib/projects/public-service";

export async function GET(request: Request) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const categories = await listPublicCategories();

  return NextResponse.json(
    {
      categories: categories.map((item) => ({ value: item.category, count: item._count })),
    },
    { headers: rateLimitResult.headers }
  );
}
```

- [ ] **Step 5: Update `src/app/api/v1/regions/route.ts`**

Replace the file content with:

```ts
import { NextResponse } from "next/server";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { listPublicRegions } from "@/lib/projects/public-service";

export async function GET(request: Request) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const regions = await listPublicRegions();

  return NextResponse.json(
    {
      regions: regions.map((item) => ({ value: item.region, count: item._count })),
    },
    { headers: rateLimitResult.headers }
  );
}
```

- [ ] **Step 6: Run the helper test again**

Run:

```bash
pnpm test -- __tests__/lib/public-api-rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run TypeScript-facing build later, but inspect route diff now**

Run:

```bash
git diff -- src/app/api/v1/projects/route.ts 'src/app/api/v1/projects/[id]/route.ts' 'src/app/api/v1/projects/[id]/analysis/route.ts' src/app/api/v1/categories/route.ts src/app/api/v1/regions/route.ts
```

Expected: every `/api/v1/*` route calls `enforcePublicApiRateLimit(request)` before service/database work.

---

## Task 3: Sitemap Revalidation and Limit Parser

**Files:**
- Create: `src/lib/projects/sitemap.ts`
- Create: `__tests__/app/sitemap.test.ts`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Write failing sitemap limit tests**

Create `__tests__/app/sitemap.test.ts` with this content:

```ts
import { parseSitemapProjectLimit } from "@/lib/projects/sitemap";

describe("parseSitemapProjectLimit", () => {
  it("uses default for missing, blank, invalid, negative, or decimal values", () => {
    expect(parseSitemapProjectLimit(undefined)).toBe(5000);
    expect(parseSitemapProjectLimit("")).toBe(5000);
    expect(parseSitemapProjectLimit("abc")).toBe(5000);
    expect(parseSitemapProjectLimit("-1")).toBe(5000);
    expect(parseSitemapProjectLimit("12.5")).toBe(5000);
  });

  it("treats zero as disabling project sitemap entries", () => {
    expect(parseSitemapProjectLimit("0")).toBe(0);
  });

  it("clamps positive values into the allowed range", () => {
    expect(parseSitemapProjectLimit("1")).toBe(1);
    expect(parseSitemapProjectLimit("4999")).toBe(4999);
    expect(parseSitemapProjectLimit("50000")).toBe(50000);
    expect(parseSitemapProjectLimit("50001")).toBe(50000);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- __tests__/app/sitemap.test.ts
```

Expected: FAIL because `@/lib/projects/sitemap` does not exist.

- [ ] **Step 3: Create the sitemap helper**

Create `src/lib/projects/sitemap.ts` with this content:

```ts
export const DEFAULT_SITEMAP_PROJECT_LIMIT = 5000;
export const MAX_SITEMAP_PROJECT_LIMIT = 50000;

export function parseSitemapProjectLimit(value = process.env.SITEMAP_PROJECT_LIMIT): number {
  const raw = value?.trim();
  if (!raw) return DEFAULT_SITEMAP_PROJECT_LIMIT;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_SITEMAP_PROJECT_LIMIT;
  if (parsed === 0) return 0;

  return Math.min(parsed, MAX_SITEMAP_PROJECT_LIMIT);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- __tests__/app/sitemap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `src/app/sitemap.ts`**

Replace the file content with:

```ts
import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { parseSitemapProjectLimit } from "@/lib/projects/sitemap";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";

export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/projects`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/refund`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const projectLimit = parseSitemapProjectLimit();
  if (projectLimit === 0) return staticPages;

  const projects = await prisma.supportProject.findMany({
    where: {
      deletedAt: null,
      publicationStatus: "visible",
      OR: [{ isCanonical: true }, { groupId: null }],
    },
    select: {
      id: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: projectLimit,
  });

  const projectPages: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${SITE_URL}/projects/${project.id}`,
    lastModified: project.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...projectPages];
}
```

- [ ] **Step 6: Run the sitemap test again**

Run:

```bash
pnpm test -- __tests__/app/sitemap.test.ts
```

Expected: PASS.

- [ ] **Step 7: Inspect the diff**

Run:

```bash
git diff -- src/lib/projects/sitemap.ts __tests__/app/sitemap.test.ts src/app/sitemap.ts
```

Expected: `src/app/sitemap.ts` exports `revalidate = 600`, no longer exports `dynamic = "force-dynamic"`, and uses `take: projectLimit`.

---

## Task 4: Low-Confidence AI Warning Component

**Files:**
- Create: `src/components/projects/project-analysis-confidence-warning.tsx`
- Create: `__tests__/components/projects/project-analysis-confidence-warning.test.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Write failing warning component tests**

Create `__tests__/components/projects/project-analysis-confidence-warning.test.tsx` with this content:

```tsx
import { render } from "@testing-library/react";
import {
  ProjectAnalysisConfidenceWarning,
  shouldShowAnalysisConfidenceWarning,
} from "@/components/projects/project-analysis-confidence-warning";

describe("ProjectAnalysisConfidenceWarning", () => {
  it("shows warning only for low confidence", () => {
    expect(shouldShowAnalysisConfidenceWarning("low")).toBe(true);
    expect(shouldShowAnalysisConfidenceWarning(null)).toBe(false);
    expect(shouldShowAnalysisConfidenceWarning("medium")).toBe(false);
    expect(shouldShowAnalysisConfidenceWarning("high")).toBe(false);
  });

  it("renders Korean warning copy for low confidence", () => {
    const { container } = render(<ProjectAnalysisConfidenceWarning confidence="low" />);

    expect(container.textContent).toContain("AI 분석 신뢰도가 낮아 원문 확인이 필요합니다.");
  });

  it("renders nothing for null confidence", () => {
    const { container } = render(<ProjectAnalysisConfidenceWarning confidence={null} />);

    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- __tests__/components/projects/project-analysis-confidence-warning.test.tsx
```

Expected: FAIL because `@/components/projects/project-analysis-confidence-warning` does not exist.

- [ ] **Step 3: Create the warning component**

Create `src/components/projects/project-analysis-confidence-warning.tsx` with this content:

```tsx
import { Card } from "@/components/ui/card";

interface ProjectAnalysisConfidenceWarningProps {
  confidence: string | null | undefined;
}

export function shouldShowAnalysisConfidenceWarning(confidence: string | null | undefined): boolean {
  return confidence === "low";
}

export function ProjectAnalysisConfidenceWarning({ confidence }: ProjectAnalysisConfidenceWarningProps) {
  if (!shouldShowAnalysisConfidenceWarning(confidence)) return null;

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      AI 분석 신뢰도가 낮아 원문 확인이 필요합니다.
    </Card>
  );
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- __tests__/components/projects/project-analysis-confidence-warning.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Update `src/app/projects/[id]/page.tsx` imports**

Add this import near the other project component imports:

```ts
import { ProjectAnalysisConfidenceWarning } from "@/components/projects/project-analysis-confidence-warning";
```

The top imports should include:

```ts
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProjectShareActions } from "@/components/projects/project-share-actions";
import { ProjectAnalysisConfidenceWarning } from "@/components/projects/project-analysis-confidence-warning";
import { getPublicProject } from "@/lib/projects/public-service";
```

- [ ] **Step 6: Render the warning near AI summary**

In `src/app/projects/[id]/page.tsx`, replace the AI summary card block:

```tsx
<Card className="p-6">
  <h2 className="mb-4 text-xl font-semibold">AI 요약</h2>
  <p className="text-muted-foreground">{project.analysis?.summary.plain ?? project.summary}</p>
</Card>
```

with:

```tsx
<Card className="p-6">
  <h2 className="mb-4 text-xl font-semibold">AI 요약</h2>
  <ProjectAnalysisConfidenceWarning confidence={project.trust.confidence} />
  <p className="text-muted-foreground">{project.analysis?.summary.plain ?? project.summary}</p>
</Card>
```

- [ ] **Step 7: Run the focused component test again**

Run:

```bash
pnpm test -- __tests__/components/projects/project-analysis-confidence-warning.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Inspect the diff**

Run:

```bash
git diff -- src/components/projects/project-analysis-confidence-warning.tsx __tests__/components/projects/project-analysis-confidence-warning.test.tsx src/app/projects/'[id]'/page.tsx
```

Expected: warning appears only inside the AI summary section and only for low confidence.

---

## Task 5: Internal API Key Missing Observability

**Files:**
- Modify: `src/lib/internal-api.ts`
- Modify: `__tests__/lib/internal-api.test.ts`

- [ ] **Step 1: Replace internal API tests with explicit env cases**

Replace `__tests__/lib/internal-api.test.ts` with this content:

```ts
import { Request } from "node-fetch";
import { isValidInternalRequest } from "@/lib/internal-api";

const warnMock = jest.fn();

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    warn: warnMock,
  })),
}));

describe("internal API auth", () => {
  const original = process.env.INTERNAL_API_KEY;

  beforeEach(() => {
    warnMock.mockClear();
  });

  afterEach(() => {
    process.env.INTERNAL_API_KEY = original;
  });

  it("rejects missing request key when internal key is configured", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health");

    expect(isValidInternalRequest(request)).toBe(false);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("rejects and logs when internal key is not configured", () => {
    delete process.env.INTERNAL_API_KEY;
    const request = new Request("http://localhost/api/internal/pipeline/health");

    expect(isValidInternalRequest(request)).toBe(false);
    expect(warnMock).toHaveBeenCalledWith("INTERNAL_API_KEY is not configured");
  });

  it("rejects invalid key", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "wrong" } });

    expect(isValidInternalRequest(request)).toBe(false);
  });

  it("accepts matching key", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "secret" } });

    expect(isValidInternalRequest(request)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- __tests__/lib/internal-api.test.ts
```

Expected: FAIL because missing `INTERNAL_API_KEY` does not log yet.

- [ ] **Step 3: Update `src/lib/internal-api.ts`**

Replace the file content with:

```ts
import { createLogger } from "@/lib/logger";

const logger = createLogger({ module: "internal-api" });

export function isValidInternalRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    logger.warn("INTERNAL_API_KEY is not configured");
    return false;
  }
  return request.headers.get("X-Internal-Key") === expected;
}

export function unauthorizedInternalResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- __tests__/lib/internal-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect the diff**

Run:

```bash
git diff -- src/lib/internal-api.ts __tests__/lib/internal-api.test.ts
```

Expected: missing env still returns `false`, now with one warning.

---

## Task 6: Combined Verification

**Files:**
- All files changed in Tasks 1-5.

- [ ] **Step 1: Run all focused tests from the spec**

Run:

```bash
pnpm test -- __tests__/lib/public-api-rate-limit.test.ts __tests__/lib/internal-api.test.ts __tests__/app/sitemap.test.ts __tests__/components/projects/project-analysis-confidence-warning.test.tsx
```

Expected: PASS for all listed suites.

- [ ] **Step 2: Run existing public boundary tests**

Run:

```bash
pnpm test -- __tests__/lib/projects/public-dto.test.ts __tests__/lib/projects/public-query.test.ts __tests__/lib/projects/analysis-schema.test.ts
```

Expected: PASS. These confirm the existing public DTO/query/schema boundary was not regressed.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS. If it fails, stop and record the exact error output before changing code.

- [ ] **Step 4: Inspect full diff**

Run:

```bash
git diff --stat && git diff -- src/lib/public-api-rate-limit.ts src/app/api/v1 src/lib/projects/sitemap.ts src/app/sitemap.ts src/components/projects/project-analysis-confidence-warning.tsx src/app/projects/'[id]'/page.tsx src/lib/internal-api.ts __tests__
```

Expected: diff is limited to launch hardening files and tests.

- [ ] **Step 5: Confirm acceptance criteria manually from diff**

Check these strings appear in the diff or final files:

```bash
grep -R "enforcePublicApiRateLimit(request)" src/app/api/v1
```

Expected: all five public API routes contain the guard.

```bash
grep -n "revalidate = 600\|take: projectLimit\|parseSitemapProjectLimit" src/app/sitemap.ts src/lib/projects/sitemap.ts
```

Expected: route-level revalidation, DB cap, and parser are present.

```bash
grep -R "AI 분석 신뢰도가 낮아 원문 확인이 필요합니다" src/app src/components __tests__
```

Expected: warning copy appears in the component/test and is rendered from the project detail page.

- [ ] **Step 6: Stop for review**

Do not commit unless the user explicitly asks. Report:

- Tests run and status.
- Build status.
- Files changed.
- Any blocker or deviation from this plan.

---

## Self-Review

Spec coverage:

- Public API rate limiting: Tasks 1-2.
- Sitemap caching and cap: Task 3.
- Low-confidence AI warning: Task 4.
- Internal API key observability: Task 5.
- Verification: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps remain.
- Every created/modified file has concrete code or exact replacement instructions.

Type consistency:

- `enforcePublicApiRateLimit(request: Request)` is used by all routes.
- Helper returns `{ response: Response | null; headers: HeadersInit }` consistently.
- Sitemap parser returns `number` and handles `0` explicitly.
- Warning helper accepts `string | null | undefined`, matching `project.trust.confidence` usage.

## Notes for Executor

- This repository uses global instructions that prohibit commits unless explicitly requested. The task steps therefore stop at diff/test/build verification rather than commit commands.
- Keep code comments minimal. Do not add comments beyond what already appears in the provided code snippets.
- If a test fails for an unexpected reason, stop and diagnose root cause before changing multiple files.
