import { prisma } from '../../src/lib/prisma';
import { processCrawlJob } from '../../src/lib/crawler/worker';

const APPROVED_SOURCE_ID = 'cmiy3092g001ksick3otlptfn';

function requireApprovedSourceId(): string {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    throw new Error(
      `Usage: TEST_MAX_PROJECTS=1 pnpm exec tsx tasks/tmp/pipeline-controlled-crawl.ts ${APPROVED_SOURCE_ID}`,
    );
  }

  const [sourceId] = args;
  if (sourceId !== APPROVED_SOURCE_ID) {
    throw new Error(`Refusing unapproved source ID: ${sourceId}`);
  }

  return sourceId;
}

async function main() {
  const sourceId = requireApprovedSourceId();

  if (process.env.TEST_MAX_PROJECTS !== '1') {
    throw new Error('Refusing to run unless TEST_MAX_PROJECTS=1 is set in the process');
  }

  const source = await prisma.crawlSource.findUnique({
    where: { id: sourceId },
    select: { id: true, name: true, url: true, type: true, isActive: true, lastCrawled: true },
  });

  if (!source) throw new Error(`CrawlSource not found: ${sourceId}`);
  if (!source.isActive) throw new Error(`CrawlSource is not active: ${sourceId}`);

  const beforeLatestProject = await prisma.supportProject.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, updatedAt: true },
  });

  const job = await prisma.crawlJob.create({
    data: { sourceId: source.id, status: 'pending' },
    select: { id: true, sourceId: true, status: true, createdAt: true },
  });

  const stats = await processCrawlJob(job.id);

  const afterJob = await prisma.crawlJob.findUnique({
    where: { id: job.id },
    select: {
      id: true,
      sourceId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      projectsFound: true,
      projectsNew: true,
      projectsUpdated: true,
    },
  });

  const changedProjects = await prisma.supportProject.findMany({
    where: beforeLatestProject ? { updatedAt: { gt: beforeLatestProject.updatedAt } } : {},
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      name: true,
      organization: true,
      crawledAt: true,
      updatedAt: true,
      analysisVersion: true,
      analyzedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          shouldParse: true,
          isParsed: true,
          parsedContent: true,
          parseError: true,
        },
      },
    },
  });

  const evidence = {
    source: {
      ...source,
      url: '[redacted]',
      lastCrawled: source.lastCrawled?.toISOString() ?? null,
    },
    job: afterJob
      ? {
          ...afterJob,
          startedAt: afterJob.startedAt?.toISOString() ?? null,
          completedAt: afterJob.completedAt?.toISOString() ?? null,
        }
      : null,
    stats,
    changedProjects: changedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      organization: project.organization,
      crawledAt: project.crawledAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
      analysisVersion: project.analysisVersion,
      analyzedAt: project.analyzedAt?.toISOString() ?? null,
      needsAnalysis: project.needsAnalysis,
      needsEmbedding: project.needsEmbedding,
      attachmentCount: project.attachments.length,
      parsedAttachmentCount: project.attachments.filter((attachment) => attachment.isParsed).length,
      attachments: project.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        shouldParse: attachment.shouldParse,
        isParsed: attachment.isParsed,
        parsedContentLength: attachment.parsedContent?.length ?? 0,
        parseError: attachment.parseError,
      })),
    })),
  };

  console.log(JSON.stringify(evidence, null, 2));

  if (afterJob?.sourceId !== APPROVED_SOURCE_ID) {
    console.error('Crawl job source ID did not match approved source');
    process.exitCode = 1;
  }

  if (afterJob?.status !== 'completed') {
    process.exitCode = 1;
  }

  if ((afterJob?.projectsNew ?? 0) + (afterJob?.projectsUpdated ?? 0) > 1) {
    console.error('TEST_MAX_PROJECTS=1 did not limit persisted/processed projects to one');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
