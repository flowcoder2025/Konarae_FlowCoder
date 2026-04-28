import { prisma } from '../../src/lib/prisma';
import { analyzeProject } from '../../src/lib/crawler/project-analyzer';

const APPROVED_PROJECT_IDS = new Set([
  'cmnq9prg80ec8qq0zgfb4r5ay',
  'cmohbywu518k4qq0zrhvl72qv',
]);

function requireProjectId(): string {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    throw new Error('Usage: pnpm exec tsx tasks/tmp/pipeline-dry-analysis.ts <projectId>');
  }

  const [projectId] = args;
  if (!APPROVED_PROJECT_IDS.has(projectId)) {
    throw new Error(`Refusing to analyze project outside approved Task 3/5 scope: ${projectId}`);
  }

  return projectId;
}

async function snapshot(projectId: string) {
  const project = await prisma.supportProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      analysisVersion: true,
      analyzedAt: true,
      needsAnalysis: true,
      needsEmbedding: true,
      descriptionMarkdown: true,
      eligibilityCriteria: true,
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
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!project) throw new Error(`Project not found: ${projectId}`);

  return {
    id: project.id,
    name: project.name,
    analysisVersion: project.analysisVersion,
    analyzedAt: project.analyzedAt?.toISOString() ?? null,
    needsAnalysis: project.needsAnalysis,
    needsEmbedding: project.needsEmbedding,
    descriptionMarkdownLength: project.descriptionMarkdown?.length ?? 0,
    hasEligibilityCriteria: project.eligibilityCriteria != null,
    attachmentCount: project.attachments.length,
    parsedAttachmentCount: project.attachments.filter((attachment) => attachment.isParsed).length,
    parsedAttachmentContentLengths: project.attachments
      .filter((attachment) => attachment.isParsed)
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        parsedContentLength: attachment.parsedContent?.length ?? 0,
        parseError: attachment.parseError,
      })),
  };
}

async function main() {
  const projectId = requireProjectId();
  const before = await snapshot(projectId);
  const result = await analyzeProject(projectId);
  const after = await snapshot(projectId);

  const checks = {
    success: result.success,
    descriptionMarkdownNonEmpty: after.descriptionMarkdownLength > 0,
    analysisVersionIncrementedByOne: after.analysisVersion === before.analysisVersion + 1,
    analyzedAtUpdated: after.analyzedAt !== before.analyzedAt && after.analyzedAt !== null,
    needsAnalysisFalse: after.needsAnalysis === false,
    needsEmbeddingTrue: after.needsEmbedding === true,
  };

  const success = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    before,
    result: {
      success: result.success,
      error: result.error,
      markdownLength: result.markdown?.length ?? 0,
    },
    after,
    checks,
    success,
  }, null, 2));

  if (!success) {
    console.error('Pipeline dry analysis verification failed');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
