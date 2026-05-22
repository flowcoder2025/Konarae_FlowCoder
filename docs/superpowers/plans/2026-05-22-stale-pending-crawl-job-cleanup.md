# Stale Pending Crawl Job Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent old `pending` crawl jobs from blocking future `crawl-all` schedules by automatically marking queue-stale jobs as failed before source scheduling runs.

**Architecture:** Keep the cleanup inside `src/lib/crawler/job-scheduler.ts`, next to the existing stale `running` cleanup. Add a focused unit test that reproduces the production failure mode: old `pending` jobs are considered active by `createCrawlJobsForAvailableSources()` and therefore block new jobs forever unless cleaned first.

**Tech Stack:** Next.js App Router cron route, Prisma-compatible scheduler client interface, Jest unit tests, TypeScript.

---

## File Structure

- Modify: `src/lib/crawler/job-scheduler.ts`
  - Add `STALE_PENDING_CRAWL_JOB_HOURS = 12`.
  - Add `markStalePendingCrawlJobs(prisma, now)` that updates only `status: "pending"` jobs with `createdAt < now - 12h` to `failed`.
  - Keep `markStaleRunningCrawlJobs()` unchanged except for shared type compatibility if needed.
- Modify: `src/app/api/cron/crawl-all/route.ts`
  - Import `markStalePendingCrawlJobs`.
  - Run pending cleanup before `createCrawlJobsForAvailableSources()`.
  - Include cleanup count in logs and response as `stalePendingJobsCleaned`.
- Modify: `__tests__/lib/crawler/job-scheduler.test.ts`
  - Add failing unit test for stale pending cleanup.
  - Update import list.
- Modify: `tasks/todo.md`
  - Record the current checklist and results after implementation.

## Acceptance Criteria

- `crawl-all` automatically marks `pending` jobs older than 12 hours as `failed` before checking source blockers.
- Fresh `pending` jobs are still treated as active blockers and are not cleaned.
- `running` cleanup behavior remains unchanged.
- `createCrawlJobsForAvailableSources()` continues to skip sources with non-stale `pending` or `running` jobs.
- Focused Jest tests pass.
- TypeScript typecheck passes.
- No production data mutation is performed by tests.

---

### Task 1: Add stale pending cleanup unit test

**Files:**
- Modify: `__tests__/lib/crawler/job-scheduler.test.ts`

- [ ] **Step 1: Update imports for the new cleanup function**

Change the import block at the top of `__tests__/lib/crawler/job-scheduler.test.ts` to:

```ts
import {
  createCrawlJobsForAvailableSources,
  markStalePendingCrawlJobs,
  markStaleRunningCrawlJobs,
} from "@/lib/crawler/job-scheduler";
```

- [ ] **Step 2: Add the failing stale pending cleanup test**

Add this test after the existing `marks stale running jobs using the configured threshold` test:

```ts
  it("marks stale pending jobs using the configured queue threshold", async () => {
    const prisma = {
      crawlJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      crawlSource: {
        update: jest.fn(),
      },
    };
    const now = new Date("2026-05-22T12:00:00.000Z");

    await expect(markStalePendingCrawlJobs(prisma, now)).resolves.toBe(3);

    expect(prisma.crawlJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: "pending",
        createdAt: { lt: new Date("2026-05-22T00:00:00.000Z") },
      },
      data: {
        status: "failed",
        completedAt: now,
        errorMessage:
          "Operational cleanup: stale pending crawl job exceeded 12h queue threshold and was blocking source rescheduling.",
      },
    });
  });
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
npm test -- __tests__/lib/crawler/job-scheduler.test.ts
```

Expected: FAIL with an import/export error for `markStalePendingCrawlJobs`.

---

### Task 2: Implement stale pending cleanup in scheduler

**Files:**
- Modify: `src/lib/crawler/job-scheduler.ts`
- Test: `__tests__/lib/crawler/job-scheduler.test.ts`

- [ ] **Step 1: Add the pending queue threshold constant**

At the top of `src/lib/crawler/job-scheduler.ts`, change:

```ts
export const ACTIVE_CRAWL_JOB_STATUSES = ["pending", "running"] as const;
export const STALE_RUNNING_CRAWL_JOB_HOURS = 12;
```

to:

```ts
export const ACTIVE_CRAWL_JOB_STATUSES = ["pending", "running"] as const;
export const STALE_RUNNING_CRAWL_JOB_HOURS = 12;
export const STALE_PENDING_CRAWL_JOB_HOURS = 12;
```

- [ ] **Step 2: Add the cleanup function**

Add this function immediately after `markStaleRunningCrawlJobs()`:

```ts
export async function markStalePendingCrawlJobs(
  prisma: CrawlJobSchedulerClient,
  now = new Date()
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_PENDING_CRAWL_JOB_HOURS * 60 * 60 * 1000);
  const result = await prisma.crawlJob.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: staleBefore },
    },
    data: {
      status: "failed",
      completedAt: now,
      errorMessage: `Operational cleanup: stale pending crawl job exceeded ${STALE_PENDING_CRAWL_JOB_HOURS}h queue threshold and was blocking source rescheduling.`,
    },
  });

  return result.count;
}
```

- [ ] **Step 3: Run the focused scheduler tests**

Run:

```bash
npm test -- __tests__/lib/crawler/job-scheduler.test.ts
```

Expected: PASS for all scheduler tests.

---

### Task 3: Wire stale pending cleanup into crawl-all cron

**Files:**
- Modify: `src/app/api/cron/crawl-all/route.ts`

- [ ] **Step 1: Add the new import**

Change the import block in `src/app/api/cron/crawl-all/route.ts` from:

```ts
import {
  createCrawlJobsForAvailableSources,
  markStaleRunningCrawlJobs,
} from "@/lib/crawler/job-scheduler";
```

to:

```ts
import {
  createCrawlJobsForAvailableSources,
  markStalePendingCrawlJobs,
  markStaleRunningCrawlJobs,
} from "@/lib/crawler/job-scheduler";
```

- [ ] **Step 2: Run pending cleanup before scheduling and update response fields atomically**

Replace this block in one edit so the route never sits in an intermediate TypeScript-invalid state:

```ts
    const staleJobsCleaned = await markStaleRunningCrawlJobs(prisma);
    if (staleJobsCleaned > 0) {
      logger.warn(`Marked ${staleJobsCleaned} stale running crawl job(s) as failed`);
    }

    const { jobs, skippedSources } = await createCrawlJobsForAvailableSources(prisma, activeSources);

    logger.info(`Created ${jobs.length} crawl job(s), skipped ${skippedSources.length} source(s) with active jobs`);

    // Delegate jobs to Railway worker
    // Railway has no time limit, can process all jobs in background
```

with:

```ts
    const staleRunningJobsCleaned = await markStaleRunningCrawlJobs(prisma);
    if (staleRunningJobsCleaned > 0) {
      logger.warn(`Marked ${staleRunningJobsCleaned} stale running crawl job(s) as failed`);
    }

    const stalePendingJobsCleaned = await markStalePendingCrawlJobs(prisma);
    if (stalePendingJobsCleaned > 0) {
      logger.warn(`Marked ${stalePendingJobsCleaned} stale pending crawl job(s) as failed`);
    }

    const { jobs, skippedSources } = await createCrawlJobsForAvailableSources(prisma, activeSources);

    logger.info(`Created ${jobs.length} crawl job(s), skipped ${skippedSources.length} source(s) with active jobs`);

    // Delegate jobs to the external crawler worker
    // The worker has no serverless timeout and can process jobs in background
```

In the same edit, replace this response section:

```ts
      jobsCreated: jobs.length,
      jobsSkipped: skippedSources.length,
      staleJobsCleaned,
      sources: jobs.map((j) => j.sourceName),
```

with:

```ts
      jobsCreated: jobs.length,
      jobsSkipped: skippedSources.length,
      staleRunningJobsCleaned,
      stalePendingJobsCleaned,
      sources: jobs.map((j) => j.sourceName),
```

Do not run `tsc` until both replacements in this step are applied.

- [ ] **Step 3: Run TypeScript typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 4: Verification and operational safety check

**Files:**
- No source changes beyond Tasks 1-3.
- Modify: `tasks/todo.md` with final results.

- [ ] **Step 1: Run focused scheduler test**

Run:

```bash
npm test -- __tests__/lib/crawler/job-scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Confirm the production backlog is still clear without mutating data**

Run:

```bash
set -a && source .env.local && set +a && NODE_ENV=production npx tsx - <<'TS'
const mod = await import("./src/lib/prisma.ts");
const { prisma } = mod.default ?? mod;
const activeJobBlockers = await prisma.crawlJob.count({
  where: { status: { in: ["pending", "running"] } },
});
const activeSources = await prisma.crawlSource.count({ where: { isActive: true } });
console.log(JSON.stringify({ activeSources, activeJobBlockers }, null, 2));
await prisma.$disconnect();
TS
```

Expected:

```json
{
  "activeSources": 24,
  "activeJobBlockers": 0
}
```

If a new cron has run before this check, `activeJobBlockers` may be greater than `0`; inspect the newest blocker `createdAt` before taking action.

- [ ] **Step 4: Update `tasks/todo.md` results**

Append this result block:

```md
---

# Stale Pending Crawl Job Cleanup Results

- Added automatic cleanup for crawl jobs stuck in `pending` for more than 12 hours.
- Wired cleanup into `/api/cron/crawl-all` before source scheduling so old queue items cannot block active sources.
- Verification:
  - `npm test -- __tests__/lib/crawler/job-scheduler.test.ts`: PASS
  - `npx tsc --noEmit`: PASS
  - Production read-only blocker check: PASS or note current active cron jobs if any exist
```

- [ ] **Step 5: Do not commit unless explicitly requested**

Per repository workflow safety, leave changes uncommitted unless the user explicitly asks for a commit. If the user asks for a commit, use the WI commit format required by project rules.

---

## Self-Review

- Spec coverage: The plan covers the observed root cause, which was stale `pending` jobs being treated as active blockers by `createCrawlJobsForAvailableSources()`.
- Placeholder scan: No placeholder implementation steps remain.
- Type consistency: Function names and response fields are consistent: `markStalePendingCrawlJobs`, `staleRunningJobsCleaned`, and `stalePendingJobsCleaned`.
