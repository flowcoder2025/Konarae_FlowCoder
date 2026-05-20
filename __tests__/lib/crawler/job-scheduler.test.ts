import {
  createCrawlJobsForAvailableSources,
  markStaleRunningCrawlJobs,
} from "@/lib/crawler/job-scheduler";

describe("crawler job scheduler", () => {
  it("marks stale running jobs using the configured threshold", async () => {
    const prisma = {
      crawlJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      crawlSource: {
        update: jest.fn(),
      },
    };
    const now = new Date("2026-05-18T12:00:00.000Z");

    await expect(markStaleRunningCrawlJobs(prisma, now)).resolves.toBe(2);

    expect(prisma.crawlJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: "running",
        OR: [
          { startedAt: { lt: new Date("2026-05-18T00:00:00.000Z") } },
          { startedAt: null, createdAt: { lt: new Date("2026-05-18T00:00:00.000Z") } },
        ],
      },
      data: {
        status: "failed",
        completedAt: now,
        errorMessage: "Operational cleanup: stale running crawl job exceeded 12h runtime threshold.",
      },
    });
  });

  it("skips sources that already have pending or running jobs", async () => {
    const prisma = {
      crawlJob: {
        updateMany: jest.fn(),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "active-job", status: "running" })
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: "new-job" }),
      },
      crawlSource: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const now = new Date("2026-05-18T12:00:00.000Z");

    const result = await createCrawlJobsForAvailableSources(
      prisma,
      [
        { id: "source-a", name: "Source A" },
        { id: "source-b", name: "Source B" },
      ],
      now
    );

    expect(result).toEqual({
      jobs: [{ jobId: "new-job", sourceName: "Source B" }],
      skippedSources: [
        {
          sourceId: "source-a",
          sourceName: "Source A",
          activeJobId: "active-job",
          activeJobStatus: "running",
        },
      ],
    });
    expect(prisma.crawlJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.crawlJob.create).toHaveBeenCalledWith({
      data: {
        sourceId: "source-b",
        status: "pending",
      },
    });
    expect(prisma.crawlSource.update).toHaveBeenCalledWith({
      where: { id: "source-b" },
      data: { lastCrawled: now },
    });
  });
});
