/**
 * Railway Worker - Embedding Generation Endpoint
 *
 * 이 코드를 Railway의 worker-server.ts에 추가하세요.
 *
 * Instructions:
 * 1. Railway 프로젝트의 worker-server.ts 파일을 엽니다
 * 2. 기존 /crawl 엔드포인트 아래에 이 코드를 추가합니다
 * 3. Railway에 배포합니다
 */

import { prisma } from '@/lib/prisma';
import { storeDocumentEmbeddings } from '@/lib/rag';

/**
 * POST /generate-embeddings
 *
 * Generate embeddings for projects with needsEmbedding=true
 * Processes in batches to avoid memory issues
 */
app.post('/generate-embeddings', async (req, res) => {
  const startTime = Date.now();

  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      console.error('[Embedding] Unauthorized request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { batchSize = 50 } = req.body;

    console.log(`[Embedding] Starting batch embedding generation (batch size: ${batchSize})`);

    // Get projects needing embeddings
    const projects = await prisma.supportProject.findMany({
      where: {
        needsEmbedding: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        eligibility: true,
        applicationProcess: true,
        evaluationCriteria: true,
        target: true,
      },
      take: batchSize,
      orderBy: {
        updatedAt: 'desc', // Process newest first
      },
    });

    if (projects.length === 0) {
      console.log('[Embedding] No projects need embeddings');
      return res.json({
        success: true,
        message: 'No projects need embeddings',
        processed: 0,
        duration: Date.now() - startTime,
      });
    }

    console.log(`[Embedding] Processing ${projects.length} project(s)`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ projectId: string; error: string }> = [];

    // Process each project
    for (const project of projects) {
      try {
        // Build content for embedding
        const contentParts = [
          project.name,
          project.summary,
          project.description,
          project.eligibility,
          project.applicationProcess,
          project.evaluationCriteria,
          project.target,
        ].filter(Boolean);

        const content = contentParts.join('\n\n');

        if (!content.trim()) {
          console.warn(`[Embedding] Project ${project.id} has no content to embed`);
          // Still mark as processed to avoid retry
          await prisma.supportProject.update({
            where: { id: project.id },
            data: { needsEmbedding: false },
          });
          errorCount++;
          errors.push({
            projectId: project.id,
            error: 'No content to embed',
          });
          continue;
        }

        // Generate and store embeddings
        await storeDocumentEmbeddings(
          'support_project',
          project.id,
          content,
          {
            name: project.name,
            generated_at: new Date().toISOString(),
          }
        );

        // Mark as processed
        await prisma.supportProject.update({
          where: { id: project.id },
          data: { needsEmbedding: false },
        });

        successCount++;
        console.log(`[Embedding] ✓ Generated embeddings for: ${project.name}`);
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Embedding] ✗ Failed for project ${project.id}:`, errorMessage);
        errors.push({
          projectId: project.id,
          error: errorMessage,
        });

        // Don't mark as processed if there was an error
        // Will retry on next run
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[Embedding] Batch complete: ${successCount} success, ${errorCount} errors in ${duration}ms`);

    return res.json({
      success: true,
      message: `Processed ${projects.length} project(s)`,
      processed: projects.length,
      success: successCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Embedding] Batch error:', error);

    return res.status(500).json({
      error: 'Embedding generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });
  }
});

/**
 * GET /embedding-stats
 *
 * Get statistics about embedding generation status
 */
app.get('/embedding-stats', async (req, res) => {
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [totalProjects, needsEmbedding, hasEmbeddings] = await Promise.all([
      prisma.supportProject.count({
        where: { deletedAt: null },
      }),
      prisma.supportProject.count({
        where: {
          needsEmbedding: true,
          deletedAt: null,
        },
      }),
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT source_id)::int as count
        FROM document_embeddings
        WHERE source_type = 'support_project'
      `,
    ]);

    const embeddingCount = (hasEmbeddings as any)[0]?.count || 0;

    return res.json({
      totalProjects,
      needsEmbedding,
      hasEmbeddings: embeddingCount,
      completionRate: totalProjects > 0
        ? Math.round((embeddingCount / totalProjects) * 100)
        : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Embedding] Stats error:', error);
    return res.status(500).json({
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
