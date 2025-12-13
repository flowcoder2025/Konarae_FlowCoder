/**
 * Railway Crawler Worker Server
 *
 * Vercel Serverless 한계를 극복하기 위한 독립 크롤러 워커
 * - 시간 제한 없음
 * - 백그라운드 작업 지원
 * - Keep-Alive 연결 재사용
 *
 * 실행: npm run worker
 */

import express from 'express';
import { processCrawlJob } from '@/lib/crawler/worker';
import { prisma } from '@/lib/prisma';
import { storeDocumentEmbeddings } from '@/lib/rag';

const app = express();

// JSON body parser
app.use(express.json());

// CORS 설정 (Vercel 도메인만 허용)
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000', // 로컬 개발
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health Check Endpoint
 * Railway 헬스체크 및 모니터링용
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'crawler-worker',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

/**
 * Crawler Job Processing Endpoint
 * POST /crawl
 *
 * Body: { jobId: string }
 * Headers: { Authorization: "Bearer {WORKER_API_KEY}" }
 */
app.post('/crawl', async (req, res) => {
  try {
    // 1. API 키 인증
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WORKER_API_KEY}`;

    if (!authHeader || authHeader !== expectedAuth) {
      console.error('[Worker] Unauthorized request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      });
    }

    // 2. 요청 검증
    const { jobId } = req.body;
    if (!jobId || typeof jobId !== 'string') {
      console.error('[Worker] Invalid jobId:', jobId);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jobId is required and must be a string',
      });
    }

    console.log(`[Worker] Received crawl job: ${jobId}`);

    // 3. 즉시 응답 (202 Accepted)
    res.status(202).json({
      accepted: true,
      jobId,
      message: 'Job queued for processing',
      timestamp: new Date().toISOString(),
    });

    // 4. 백그라운드에서 크롤링 실행
    console.log(`[Worker] Starting background processing for job ${jobId}`);

    processCrawlJob(jobId)
      .then((stats) => {
        console.log(`[Worker] Job ${jobId} completed successfully:`, stats);
      })
      .catch((error) => {
        console.error(`[Worker] Job ${jobId} failed:`, error);
      });

  } catch (error) {
    console.error('[Worker] Unexpected error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Batch Crawl Endpoint (선택사항)
 * POST /crawl/batch
 *
 * 여러 작업을 한 번에 처리 (향후 최적화용)
 */
app.post('/crawl/batch', async (req, res) => {
  try {
    // 인증
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WORKER_API_KEY}`;

    if (!authHeader || authHeader !== expectedAuth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 요청 검증
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jobIds must be a non-empty array',
      });
    }

    console.log(`[Worker] Received batch crawl: ${jobIds.length} jobs`);

    // 즉시 응답
    res.status(202).json({
      accepted: true,
      jobIds,
      count: jobIds.length,
      message: 'Jobs queued for processing',
      timestamp: new Date().toISOString(),
    });

    // 백그라운드에서 순차 처리
    for (const jobId of jobIds) {
      processCrawlJob(jobId)
        .then((stats) => {
          console.log(`[Worker] Batch job ${jobId} completed:`, stats);
        })
        .catch((error) => {
          console.error(`[Worker] Batch job ${jobId} failed:`, error);
        });
    }

  } catch (error) {
    console.error('[Worker] Batch processing error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
      successCount: successCount,
      errorCount: errorCount,
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

/**
 * 404 핸들러
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

/**
 * 에러 핸들러
 */
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Worker] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

/**
 * 서버 시작
 * Railway는 PORT 환경변수 자동 제공
 */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  🚀 Railway Crawler Worker Started');
  console.log('='.repeat(60));
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  console.log('');
});

/**
 * Graceful Shutdown
 * Railway 재시작 시 안전하게 종료
 */
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
