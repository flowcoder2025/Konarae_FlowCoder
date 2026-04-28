import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';

function shell(command: string): string {
  return execSync(command, {
    cwd: '/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function redactDbUrl(value: string | undefined): { present: boolean; host?: string; database?: string; protocol?: string } {
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

async function main() {
  const gitRoot = shell('git rev-parse --show-toplevel');
  const branch = shell('git branch --show-current');
  const head = shell('git rev-parse HEAD');
  const upstream = shell('git rev-parse origin/main');

  const artifacts = {
    apiV1: existsSync('/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification/src/app/api/v1'),
    apiInternal: existsSync('/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification/src/app/api/internal'),
    publicProjectsPage: existsSync('/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification/src/app/projects/page.tsx'),
    publicProjectDetail: existsSync('/Users/jerome/DEV/FlowMate/.worktrees/pipeline-e2e-verification/src/app/projects/[id]/page.tsx'),
  };

  const env = {
    DATABASE_URL: redactDbUrl(process.env.DATABASE_URL),
    DIRECT_URL: redactDbUrl(process.env.DIRECT_URL),
    OPENAI_API_KEY: { present: Boolean(process.env.OPENAI_API_KEY) },
    GOOGLE_GENERATIVE_AI_API_KEY: { present: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) },
    WORKER_API_KEY: { present: Boolean(process.env.WORKER_API_KEY) },
  };

  const candidate = await prisma.supportProject.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { description: { not: null } },
        { eligibility: { not: null } },
        { applicationProcess: { not: null } },
        { evaluationCriteria: { not: null } },
      ],
    },
    orderBy: [{ crawledAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      organization: true,
      analysisVersion: true,
      analyzedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      descriptionMarkdown: true,
      eligibilityCriteria: true,
      attachments: {
        where: { isParsed: true },
        select: { id: true, fileName: true, fileType: true, parsedContent: true },
        take: 3,
      },
    },
  });

  const source = await prisma.crawlSource.findFirst({
    where: { isActive: true },
    orderBy: [{ lastCrawled: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, url: true, type: true, lastCrawled: true },
  });

  const output = {
    git: { gitRoot, branch, head, upstream, headEqualsUpstream: head === upstream },
    artifacts,
    env,
    candidateProject: candidate
      ? {
          ...candidate,
          descriptionMarkdownLength: candidate.descriptionMarkdown?.length ?? 0,
          descriptionMarkdown: undefined,
          hasEligibilityCriteria: candidate.eligibilityCriteria != null,
          eligibilityCriteria: undefined,
          parsedAttachments: candidate.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            fileType: attachment.fileType,
            parsedContentLength: attachment.parsedContent?.length ?? 0,
          })),
          attachments: undefined,
        }
      : null,
    crawlSource: source,
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
