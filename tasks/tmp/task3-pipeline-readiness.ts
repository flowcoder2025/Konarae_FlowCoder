import { loadEnvConfig } from '@next/env';
import { existsSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';

const projectDir = '/Users/jerome/DEV/FlowMate';
const envPath = `${projectDir}/.env.local`;
loadEnvConfig(projectDir, true);

type CountRow = { key: string | null; count: number };

function redactUrl(value: string | undefined) {
  if (!value) return { present: false };
  try {
    const url = new URL(value);
    return {
      present: true,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      database: url.pathname.replace(/^\//, '') || undefined,
    };
  } catch {
    return { present: true, host: 'unparseable', database: 'unparseable' };
  }
}

function toCountMap(rows: CountRow[]) {
  return Object.fromEntries(rows.map((row) => [row.key ?? 'null', Number(row.count)]));
}

function createGroupBySql(prisma: PrismaClient) {
  return async function groupBySql(query: TemplateStringsArray) {
    const rows = await prisma.$queryRaw<CountRow[]>(query);
    return toCountMap(rows);
  };
}

async function main() {
  const { prisma } = await import('../../src/lib/prisma');
  const { getParserServiceInfo, isParserServiceAvailable } = await import('../../src/lib/document-parser');
  const groupBySql = createGroupBySql(prisma);

  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      dbCheck,
      pipelineJobStatusAll,
      pipelineJobStatus24h,
      recentPipelineJobs,
      attachmentCounts,
      needsEmbeddingCount,
      supportProjectAnalysisStatus,
      supportProjectAnalysisConfidence,
      recentCrawlJobStatus7d,
      recentCrawlJobs,
      parserInfo,
      parserHealth,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
      groupBySql`SELECT status AS key, COUNT(*)::int AS count FROM pipeline_jobs GROUP BY status ORDER BY status`,
      prisma.pipelineJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      prisma.pipelineJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          status: true,
          targetCount: true,
          successCount: true,
          failCount: true,
          triggeredBy: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      Promise.all([
        prisma.projectAttachment.count(),
        prisma.projectAttachment.count({ where: { shouldParse: true } }),
        prisma.projectAttachment.count({ where: { shouldParse: true, isParsed: false, parseError: null } }),
        prisma.projectAttachment.count({ where: { shouldParse: true, isParsed: false, parseError: { not: null } } }),
        prisma.projectAttachment.count({ where: { shouldParse: true, isParsed: true } }),
      ]),
      prisma.supportProject.count({ where: { deletedAt: null, needsEmbedding: true } }),
      groupBySql`SELECT "analysisStatus" AS key, COUNT(*)::int AS count FROM "SupportProject" WHERE "deletedAt" IS NULL GROUP BY "analysisStatus" ORDER BY "analysisStatus"`,
      groupBySql`SELECT COALESCE("analysisConfidence", 'null') AS key, COUNT(*)::int AS count FROM "SupportProject" WHERE "deletedAt" IS NULL GROUP BY COALESCE("analysisConfidence", 'null') ORDER BY key`,
      prisma.crawlJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since7d } },
        _count: { _all: true },
      }),
      prisma.crawlJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          sourceId: true,
          projectsFound: true,
          projectsNew: true,
          projectsUpdated: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
          source: { select: { name: true, type: true, isActive: true, lastCrawled: true } },
        },
      }),
      getParserServiceInfo(),
      isParserServiceAvailable(),
    ]);

    const [totalAttachments, parsableAttachments, unparsedPendingAttachments, failedAttachments, parsedAttachments] = attachmentCounts;

    const output = {
      generatedAt: now.toISOString(),
      environment: {
        envLocalLoaded: existsSync(envPath),
        databaseUrl: redactUrl(process.env.DATABASE_URL),
        directUrl: redactUrl(process.env.DIRECT_URL),
        textParserUrlPresent: Boolean(process.env.TEXT_PARSER_URL),
      },
      database: { reachable: dbCheck?.[0]?.ok === 1 },
      pipelineJobs: {
        statusCountsAllTime: pipelineJobStatusAll,
        statusCountsLast24h: Object.fromEntries(
          pipelineJobStatus24h.map((row) => [row.status, row._count._all])
        ),
        recent: recentPipelineJobs.map((job) => ({
          ...job,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
        })),
      },
      projectAttachments: {
        total: totalAttachments,
        parsable: parsableAttachments,
        parsed: parsedAttachments,
        unparsedPending: unparsedPendingAttachments,
        failed: failedAttachments,
      },
      embeddings: {
        projectsNeedingEmbedding: needsEmbeddingCount,
      },
      supportProjectAnalysis: {
        statusDistribution: supportProjectAnalysisStatus,
        confidenceDistribution: supportProjectAnalysisConfidence,
      },
      crawlJobs: {
        statusCountsLast7d: Object.fromEntries(
          recentCrawlJobStatus7d.map((row) => [row.status, row._count._all])
        ),
        recent: recentCrawlJobs.map((job) => ({
          ...job,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
          source: job.source
            ? { ...job.source, lastCrawled: job.source.lastCrawled?.toISOString() ?? null }
            : null,
        })),
      },
      parserService: {
        info: parserInfo,
        healthEndpointAvailable: parserHealth,
      },
      safety: {
        readOnly: true,
        forbiddenEndpointsNotCalled: [
          '/api/admin/pipeline/embed',
          '/api/admin/pipeline/parse',
          '/api/admin/crawler/start',
          '/api/internal/*/analyze',
        ],
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
