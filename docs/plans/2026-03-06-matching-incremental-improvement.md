# Matching System Incremental Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert matching from full-refresh to incremental upsert, send email only for new matches, always delegate to OCI Worker.

**Architecture:** `storeMatchingResults` changes from DELETE ALL + CREATE to UPSERT pattern using `@@unique([companyId, projectId])`. New `isNew` flag on `MatchingResult` tracks which results haven't been sent in digest yet. Vercel Cron becomes a pure trigger — all matching logic runs on OCI Worker.

**Tech Stack:** Prisma 6 (PostgreSQL), Next.js 15 API Routes, Express (OCI Worker)

---

### Task 1: Add `isNew` and `updatedAt` columns to MatchingResult

**Files:**
- Modify: `prisma/schema.prisma:457-490`

**Step 1: Update schema**

Add two fields to the `MatchingResult` model:

```prisma
model MatchingResult {
  id        String @id @default(cuid())
  userId    String
  companyId String
  projectId String

  // Scores
  totalScore              Int
  businessSimilarityScore Int @default(0)
  categoryScore           Int
  eligibilityScore        Int
  timelinessScore         Int
  amountScore             Int

  // Details
  confidence   String
  matchReasons String[]

  // User Feedback
  isRelevant   Boolean?
  feedbackNote String?

  // Tracking
  isNew     Boolean  @default(true)   // false after digest sent
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt       // tracks score refresh

  user    User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  project SupportProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  userProjects UserProject[]

  @@unique([companyId, projectId])
  @@index([userId])
  @@index([totalScore(sort: Desc)])
  @@index([isNew])  // digest query optimization
}
```

**Step 2: Push schema to database**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && set -a && source .env.local && set +a && npx prisma db push
```

Expected: Schema synced successfully. Existing rows get `isNew=true`, `updatedAt=now()`.

**Step 3: Generate Prisma client**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx prisma generate
```

Expected: Prisma Client generated successfully.

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add isNew and updatedAt to MatchingResult for incremental matching"
```

---

### Task 2: Rewrite `storeMatchingResults` to upsert pattern

**Files:**
- Modify: `src/lib/matching.ts:820-862`

**Step 1: Replace `storeMatchingResults` function**

Replace the entire function (lines 820-862) with:

```typescript
/**
 * Store matching results in database (incremental upsert)
 *
 * - New projects: INSERT with isNew=true
 * - Existing projects: UPDATE scores only (preserve isRelevant, feedbackNote, isNew)
 * - User feedback fields are never overwritten
 */
export async function storeMatchingResults(
  userId: string,
  companyId: string,
  results: MatchingResultData[]
): Promise<{ inserted: number; updated: number }> {
  try {
    const topResults = results.slice(0, 50);

    // Get existing results for this company to determine insert vs update
    const existingResults = await prisma.matchingResult.findMany({
      where: { companyId },
      select: { projectId: true },
    });
    const existingProjectIds = new Set(existingResults.map((r) => r.projectId));

    let inserted = 0;
    let updated = 0;

    for (const result of topResults) {
      if (existingProjectIds.has(result.projectId)) {
        // UPDATE: refresh scores, keep user feedback and isNew status
        await prisma.matchingResult.update({
          where: {
            companyId_projectId: {
              companyId,
              projectId: result.projectId,
            },
          },
          data: {
            totalScore: result.totalScore,
            businessSimilarityScore: result.businessSimilarityScore,
            categoryScore: result.categoryScore,
            eligibilityScore: result.eligibilityScore,
            confidence: result.confidence,
            matchReasons: result.matchReasons,
            // isNew, isRelevant, feedbackNote are NOT touched
          },
        });
        updated++;
      } else {
        // INSERT: new matching result
        await prisma.matchingResult.create({
          data: {
            userId,
            companyId,
            projectId: result.projectId,
            totalScore: result.totalScore,
            businessSimilarityScore: result.businessSimilarityScore,
            categoryScore: result.categoryScore,
            eligibilityScore: result.eligibilityScore,
            timelinessScore: 0,
            amountScore: 0,
            confidence: result.confidence,
            matchReasons: result.matchReasons,
            isNew: true,
          },
        });
        inserted++;
      }
    }

    logger.info("Matching results stored (incremental)", {
      inserted,
      updated,
      companyId,
    });

    return { inserted, updated };
  } catch (error) {
    logger.error("Store results error", { error, companyId });
    throw new Error("Failed to store matching results");
  }
}
```

**Step 2: Update callers to handle new return type**

The callers in `matching-refresh/route.ts:216-219` and `embedding-server.ts:657-663` use:
```typescript
await storeMatchingResults(userId, companyId, results);
```

The return type changed from `void` to `{ inserted, updated }` but callers don't destructure it, so no changes needed (backward compatible).

**Step 3: Verify TypeScript compiles**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to matching.ts

**Step 4: Commit**

```bash
git add src/lib/matching.ts
git commit -m "feat: storeMatchingResults incremental upsert - preserve feedback, track new matches"
```

---

### Task 3: Update Daily Digest to use `isNew` flag

**Files:**
- Modify: `src/app/api/cron/daily-digest/route.ts:96-130` (query)
- Modify: `src/app/api/cron/daily-digest/route.ts:217-225` (post-send update)

**Step 1: Change matching result query to filter by `isNew`**

Replace lines 96-130 with:

```typescript
    // Query matching results that haven't been sent yet (isNew=true)
    const matchingResults = await prisma.matchingResult.findMany({
      where: {
        userId: { in: usersWithSettings.map((s) => s.userId) },
        isNew: true,
      },
      select: {
        id: true,
        userId: true,
        totalScore: true,
        confidence: true,
        matchReasons: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            category: true,
            deadline: true,
            amountMin: true,
            amountMax: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { totalScore: "desc" },
    });
```

**Step 2: After sending digest, mark results as `isNew=false`**

Replace lines 217-225 (the `lastDigestSentAt` update block) with:

```typescript
    // Mark sent results as no longer new
    if (successfulUserIds.length > 0) {
      const now = new Date();

      // Batch update: set isNew=false for all sent results
      await prisma.matchingResult.updateMany({
        where: {
          userId: { in: successfulUserIds },
          isNew: true,
        },
        data: { isNew: false },
      });

      // Also update lastDigestSentAt for tracking
      await prisma.notificationSetting.updateMany({
        where: { userId: { in: successfulUserIds } },
        data: { lastDigestSentAt: now },
      });

      logger.info(`Marked results as sent for ${successfulUserIds.length} users`);
    }
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/app/api/cron/daily-digest/route.ts
git commit -m "feat: daily digest only sends new matching results (isNew flag)"
```

---

### Task 4: Simplify matching-refresh Cron to always delegate to OCI Worker

**Files:**
- Modify: `src/app/api/cron/matching-refresh/route.ts` (major simplification)

**Step 1: Rewrite the entire route**

Replace the full file content with:

```typescript
/**
 * Matching Refresh Cron Job
 * GET/POST /api/cron/matching-refresh
 *
 * Pure trigger - always delegates to OCI Worker.
 * Schedule: Daily at 06:00 KST (21:00 UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-matching-refresh" });

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const WORKER_TIMEOUT_MS = 30_000;

/**
 * Verify request authorization
 */
function verifyAuthorization(req: NextRequest): { valid: boolean; source: string } {
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { valid: true, source: "vercel-cron" };
  }

  const apiKey = req.headers.get("x-api-key");
  if (apiKey === process.env.ADMIN_API_KEY) {
    return { valid: true, source: "admin" };
  }

  const workerKey = req.headers.get("x-worker-key");
  if (workerKey === process.env.WORKER_API_KEY) {
    return { valid: true, source: "railway-worker" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Delegate matching to OCI Worker (always)
 */
async function delegateToWorker(source: string): Promise<NextResponse> {
  let workerUrl = process.env.RAILWAY_WORKER_URL;
  const workerApiKey = process.env.WORKER_API_KEY;

  if (!workerUrl || !workerApiKey) {
    logger.error("OCI Worker not configured (RAILWAY_WORKER_URL or WORKER_API_KEY missing)");
    return NextResponse.json(
      { error: "Worker not configured" },
      { status: 503 }
    );
  }

  if (!workerUrl.startsWith("http://") && !workerUrl.startsWith("https://")) {
    workerUrl = `https://${workerUrl}`;
  }

  try {
    logger.info(`Delegating matching refresh to OCI Worker via ${source}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

    const response = await fetch(`${workerUrl}/matching/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchSize: 10,
        maxCompanies: 200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Worker error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    logger.info("Matching refresh delegated successfully", { result });

    return NextResponse.json({
      success: true,
      message: "Matching refresh delegated to OCI Worker",
      triggeredBy: source,
      workerResponse: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    if (isTimeout) {
      // Worker accepted (202) but we timed out waiting - that's OK
      logger.info("Worker request timed out (likely processing in background)");
      return NextResponse.json({
        success: true,
        message: "Matching refresh triggered (worker processing in background)",
        triggeredBy: source,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error("Worker delegation failed", { error });
    return NextResponse.json(
      {
        error: "Failed to delegate matching refresh",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return delegateToWorker(source);
}

export async function POST(req: NextRequest) {
  const { valid, source } = verifyAuthorization(req);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return delegateToWorker(source);
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/app/api/cron/matching-refresh/route.ts
git commit -m "refactor: matching-refresh always delegates to OCI Worker, remove direct processing"
```

---

### Task 5: Update OCI Worker matching batch config

**Files:**
- Modify: `src/embedding-server.ts:499-500` (default params)

**Step 1: Update default batch parameters**

At line 500, change:
```typescript
    const { batchSize = 5, maxCompanies = 30 } = req.body;
```

To:
```typescript
    const { batchSize = 10, maxCompanies = 200 } = req.body;
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/embedding-server.ts
git commit -m "feat: increase OCI Worker matching capacity (maxCompanies 30→200, batchSize 5→10)"
```

---

### Task 6: Build verification and final commit

**Step 1: Full build test**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && pnpm build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

**Step 2: Verify no import issues**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Review all changes**

Run:
```bash
cd /Volumes/포터블/Production/FlowMate && git diff --stat HEAD~5
```

Expected changes:
- `prisma/schema.prisma` — isNew, updatedAt, @@index
- `src/lib/matching.ts` — storeMatchingResults upsert
- `src/app/api/cron/daily-digest/route.ts` — isNew filter
- `src/app/api/cron/matching-refresh/route.ts` — simplified, always Worker
- `src/embedding-server.ts` — batch config

---

## Post-deployment notes

After deploying to Vercel + OCI:
1. **Existing MatchingResult rows** get `isNew=true` by default — first digest after deploy will send all existing results once, then only new ones going forward.
   - If you want to avoid this, run: `UPDATE "MatchingResult" SET "isNew" = false;` before the next digest cron.
2. **OCI Worker rebuild required** — `embedding-server.ts` changed, rebuild `flowmate-embedding` container.
3. **Vercel env unchanged** — no new env vars needed.
