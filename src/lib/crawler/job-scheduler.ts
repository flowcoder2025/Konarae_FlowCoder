export const ACTIVE_CRAWL_JOB_STATUSES = ["pending", "running"] as const;
export const STALE_RUNNING_CRAWL_JOB_HOURS = 12;
export const STALE_PENDING_CRAWL_JOB_HOURS = 12;

export interface CrawlSourceForScheduling {
  id: string;
  name: string;
}

export interface ScheduledCrawlJob {
  jobId: string;
  sourceName: string;
}

export interface SkippedCrawlSource {
  sourceId: string;
  sourceName: string;
  activeJobId: string;
  activeJobStatus: string;
}

interface CrawlJobSchedulerClient {
  crawlJob: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findFirst(args: unknown): Promise<{ id: string; status: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
  crawlSource: {
    update(args: unknown): Promise<unknown>;
  };
}

export async function markStaleRunningCrawlJobs(
  prisma: CrawlJobSchedulerClient,
  now = new Date()
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_CRAWL_JOB_HOURS * 60 * 60 * 1000);
  const result = await prisma.crawlJob.updateMany({
    where: {
      status: "running",
      OR: [
        { startedAt: { lt: staleBefore } },
        { startedAt: null, createdAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "failed",
      completedAt: now,
      errorMessage: `Operational cleanup: stale running crawl job exceeded ${STALE_RUNNING_CRAWL_JOB_HOURS}h runtime threshold.`,
    },
  });

  return result.count;
}

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

export async function createCrawlJobsForAvailableSources(
  prisma: CrawlJobSchedulerClient,
  crawlSources: CrawlSourceForScheduling[],
  now = new Date()
): Promise<{ jobs: ScheduledCrawlJob[]; skippedSources: SkippedCrawlSource[] }> {
  const jobs: ScheduledCrawlJob[] = [];
  const skippedSources: SkippedCrawlSource[] = [];

  for (const crawlSource of crawlSources) {
    const activeJob = await prisma.crawlJob.findFirst({
      where: {
        sourceId: crawlSource.id,
        status: { in: ACTIVE_CRAWL_JOB_STATUSES },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });

    if (activeJob) {
      skippedSources.push({
        sourceId: crawlSource.id,
        sourceName: crawlSource.name,
        activeJobId: activeJob.id,
        activeJobStatus: activeJob.status,
      });
      continue;
    }

    const job = await prisma.crawlJob.create({
      data: {
        sourceId: crawlSource.id,
        status: "pending",
      },
    });

    await prisma.crawlSource.update({
      where: { id: crawlSource.id },
      data: { lastCrawled: now },
    });

    jobs.push({ jobId: job.id, sourceName: crawlSource.name });
  }

  return { jobs, skippedSources };
}
