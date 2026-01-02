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
import { executeMatching, storeMatchingResults } from '@/lib/matching';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ lib: 'worker-server' });

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
  logger.debug(`${req.method} ${req.path}`);
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
      logger.error('Unauthorized request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      });
    }

    // 2. 요청 검증
    const { jobId } = req.body;
    if (!jobId || typeof jobId !== 'string') {
      logger.error('Invalid jobId', { jobId });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jobId is required and must be a string',
      });
    }

    logger.info(`Received crawl job: ${jobId}`);

    // 3. 즉시 응답 (202 Accepted)
    res.status(202).json({
      accepted: true,
      jobId,
      message: 'Job queued for processing',
      timestamp: new Date().toISOString(),
    });

    // 4. 백그라운드에서 크롤링 실행
    logger.info(`Starting background processing for job ${jobId}`);

    processCrawlJob(jobId)
      .then((stats) => {
        logger.info(`Job ${jobId} completed successfully`, { stats });
      })
      .catch((error) => {
        logger.error(`Job ${jobId} failed`, { error });
      });

  } catch (error) {
    logger.error('Unexpected error', { error });
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

    logger.info(`Received batch crawl: ${jobIds.length} jobs`);

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
          logger.info(`Batch job ${jobId} completed`, { stats });
        })
        .catch((error) => {
          logger.error(`Batch job ${jobId} failed`, { error });
        });
    }

  } catch (error) {
    logger.error('Batch processing error', { error });
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
      logger.error('Embedding: Unauthorized request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { batchSize = 50 } = req.body;

    logger.info(`Embedding: Starting batch generation (batch size: ${batchSize})`);

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
      logger.info('Embedding: No projects need embeddings');
      return res.json({
        success: true,
        message: 'No projects need embeddings',
        processed: 0,
        duration: Date.now() - startTime,
      });
    }

    logger.info(`Embedding: Processing ${projects.length} project(s)`);

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
          logger.warn(`Embedding: Project ${project.id} has no content to embed`);
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
        logger.info(`Embedding: ✓ Generated for ${project.name}`);
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Embedding: ✗ Failed for project ${project.id}`, { error: errorMessage });
        errors.push({
          projectId: project.id,
          error: errorMessage,
        });

        // Don't mark as processed if there was an error
        // Will retry on next run
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`Embedding: Batch complete - ${successCount} success, ${errorCount} errors in ${duration}ms`);

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
    logger.error('Embedding: Batch error', { error });

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
    logger.error('Embedding: Stats error', { error });
    return res.status(500).json({
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /matching/batch
 *
 * Batch matching refresh for all companies with matching preferences
 * Processes in batches to avoid memory issues and enable long-running operations
 */
app.post('/matching/batch', async (req, res) => {
  const startTime = Date.now();

  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      logger.error('Matching: Unauthorized request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { batchSize = 20, maxCompanies = 500 } = req.body;

    logger.info(`Matching: Starting batch refresh (batch: ${batchSize}, max: ${maxCompanies})`);

    // Get companies with matching preferences
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        matchingPreferences: {
          some: {}, // Has at least one preference
        },
        members: {
          some: {}, // Has at least one member
        },
      },
      select: {
        id: true,
        name: true,
        matchingPreferences: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        members: {
          take: 1,
          select: { userId: true },
        },
      },
      take: maxCompanies,
    });

    if (companies.length === 0) {
      logger.info('Matching: No companies with preferences found');
      return res.json({
        success: true,
        message: 'No companies need matching refresh',
        processed: 0,
        duration: Date.now() - startTime,
      });
    }

    logger.info(`Matching: Processing ${companies.length} company(ies)`);

    // Respond immediately (202 Accepted)
    res.status(202).json({
      accepted: true,
      message: `Matching refresh started for ${companies.length} companies`,
      companiesQueued: companies.length,
      batchSize,
      timestamp: new Date().toISOString(),
    });

    // Process in background
    processMatchingBatch(companies, batchSize, startTime).catch((error) => {
      logger.error('Matching: Batch processing error', { error });
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Matching: Batch error', { error });

    return res.status(500).json({
      error: 'Matching batch failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });
  }
});

/**
 * Process matching batch in background
 */
async function processMatchingBatch(
  companies: Array<{
    id: string;
    name: string;
    matchingPreferences: Array<{
      categories: string[];
      minAmount: bigint | null;
      maxAmount: bigint | null;
      regions: string[] | null;
      excludeKeywords: string[] | null;
    }>;
    members: Array<{ userId: string }>;
  }>,
  batchSize: number,
  startTime: number
): Promise<void> {
  let successCount = 0;
  let errorCount = 0;
  let totalResultsStored = 0;
  const errors: Array<{ companyId: string; error: string }> = [];

  // Process in batches
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(companies.length / batchSize);

    logger.info(`Matching: Processing batch ${batchNum}/${totalBatches} (${batch.length} companies)`);

    // Process batch sequentially to manage memory
    for (const company of batch) {
      try {
        const preference = company.matchingPreferences[0];
        const firstMember = company.members[0];

        if (!preference || !firstMember) {
          logger.warn(`Matching: Skipping ${company.id} - missing preference or member`);
          continue;
        }

        logger.debug(`Matching: Processing ${company.name} (${company.id})`);

        // Execute matching
        const results = await executeMatching({
          companyId: company.id,
          userId: firstMember.userId,
          preferences: {
            categories: preference.categories,
            minAmount: preference.minAmount || undefined,
            maxAmount: preference.maxAmount || undefined,
            regions: preference.regions || undefined,
            excludeKeywords: preference.excludeKeywords || undefined,
          },
        });

        // Store results
        if (results.length > 0) {
          await storeMatchingResults(
            firstMember.userId,
            company.id,
            results
          );
          totalResultsStored += results.length;
        }

        successCount++;
        logger.info(`Matching: ✓ ${company.name} - ${results.length} matches stored`);

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Matching: ✗ Failed for ${company.id}`, { error: errorMessage });
        errors.push({
          companyId: company.id,
          error: errorMessage,
        });
      }
    }

    // Brief pause between batches to allow GC
    if (i + batchSize < companies.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const duration = Date.now() - startTime;
  const durationMinutes = Math.round(duration / 1000 / 60 * 10) / 10;

  logger.info('Matching Batch Complete', {
    companiesProcessed: successCount + errorCount,
    successful: successCount,
    failed: errorCount,
    totalMatchesStored: totalResultsStored,
    durationMinutes,
  });
}

/**
 * GET /matching/stats
 *
 * Get statistics about matching status
 */
app.get('/matching/stats', async (req, res) => {
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [
      totalCompanies,
      companiesWithPreferences,
      totalMatchingResults,
      recentResults,
    ] = await Promise.all([
      prisma.company.count({
        where: { deletedAt: null },
      }),
      prisma.company.count({
        where: {
          deletedAt: null,
          matchingPreferences: {
            some: {},
          },
        },
      }),
      prisma.matchingResult.count(),
      prisma.matchingResult.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return res.json({
      totalCompanies,
      companiesWithPreferences,
      totalMatchingResults,
      resultsLast24Hours: recentResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Matching: Stats error', { error });
    return res.status(500).json({
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /test-parser
 *
 * Test connection to text_parser service
 */
app.get('/test-parser', async (req, res) => {
  const startTime = Date.now();
  const parserUrl = process.env.TEXT_PARSER_URL || 'https://hwp-api.onrender.com';

  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info(`Testing parser connection: ${parserUrl}`);

    // Test health endpoint
    const healthResponse = await fetch(`${parserUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    const healthData = await healthResponse.json().catch(() => null);

    // Test root endpoint for version info
    const rootResponse = await fetch(`${parserUrl}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    const rootData = await rootResponse.json().catch(() => null);

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      parserUrl,
      healthCheck: {
        status: healthResponse.ok ? 'ok' : 'failed',
        statusCode: healthResponse.status,
        data: healthData,
      },
      serviceInfo: rootData,
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Parser test failed', { error, parserUrl });

    return res.status(502).json({
      success: false,
      parserUrl,
      error: error instanceof Error ? error.message : 'Connection failed',
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
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
  logger.error('Unhandled error', { error: err });
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
  logger.info('Railway Crawler Worker Started', {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    healthCheck: `http://localhost:${PORT}/health`,
  });
});

/**
 * Graceful Shutdown
 * Railway 재시작 시 안전하게 종료
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
