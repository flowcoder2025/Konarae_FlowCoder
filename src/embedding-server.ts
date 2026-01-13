/**
 * Railway Embedding Worker Server
 *
 * 임베딩 생성 및 매칭 전용 워커
 * - 크롤러와 분리하여 독립적 스케일링
 * - 메모리 집약적 작업 전담
 *
 * 실행: npm run worker:embedding
 */

import express from 'express';
import { prisma } from '@/lib/prisma';
import { storeDocumentEmbeddings } from '@/lib/rag';
import { executeMatching, storeMatchingResults } from '@/lib/matching';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ lib: 'embedding-server' });

const app = express();

// JSON body parser
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000',
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

// 요청 로깅
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

/**
 * Health Check
 *
 * Memory Optimization (2025.01):
 * - 메모리 임계값 경고 추가
 * - 상세 메모리 정보 제공
 */
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rssMB = Math.round(memUsage.rss / 1024 / 1024);

  // Memory warning threshold: 512MB (embedding은 더 많은 메모리 사용)
  const MEMORY_WARNING_MB = 512;
  const MEMORY_CRITICAL_MB = 1024;

  let memoryStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (rssMB > MEMORY_CRITICAL_MB) {
    memoryStatus = 'critical';
    logger.error('CRITICAL: Memory usage exceeds 1GB', { rssMB, heapUsedMB });
  } else if (rssMB > MEMORY_WARNING_MB) {
    memoryStatus = 'warning';
    logger.warn('WARNING: Memory usage exceeds 512MB', { rssMB, heapUsedMB });
  }

  res.json({
    status: memoryStatus === 'critical' ? 'degraded' : 'ok',
    service: 'embedding-worker',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      status: memoryStatus,
      raw: memUsage,
    },
  });
});

/**
 * POST /generate-embeddings
 *
 * Generate embeddings for projects with needsEmbedding=true
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
        updatedAt: 'desc',
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

    for (const project of projects) {
      try {
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

        await storeDocumentEmbeddings(
          'support_project',
          project.id,
          content,
          {
            name: project.name,
            generated_at: new Date().toISOString(),
          }
        );

        await prisma.supportProject.update({
          where: { id: project.id },
          data: { needsEmbedding: false },
        });

        successCount++;
        logger.info(`Embedding: Generated for ${project.name}`);
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Embedding: Failed for project ${project.id}`, { error: errorMessage });
        errors.push({
          projectId: project.id,
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`Embedding: Batch complete - ${successCount} success, ${errorCount} errors in ${duration}ms`);

    return res.json({
      success: true,
      message: `Processed ${projects.length} project(s)`,
      processed: projects.length,
      successCount,
      errorCount,
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
 */
app.get('/embedding-stats', async (req, res) => {
  try {
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
 * Memory Optimization (2025.01):
 * - maxCompanies 500 → 50 축소 (메모리 누수 방지)
 * - batchSize 20 → 10 축소 (GC 시간 확보)
 * - 배치 간 명시적 메모리 정리
 */
app.post('/matching/batch', async (req, res) => {
  const startTime = Date.now();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      logger.error('Matching: Unauthorized request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Memory Optimization: 배치 크기 대폭 축소
    const { batchSize = 10, maxCompanies = 50 } = req.body;

    logger.info(`Matching: Starting batch refresh (batch: ${batchSize}, max: ${maxCompanies})`);

    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        matchingPreferences: {
          some: {},
        },
        members: {
          some: {},
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
 * Force garbage collection if available
 * Node.js must be started with --expose-gc flag
 */
function tryGarbageCollection(): void {
  if (global.gc) {
    try {
      global.gc();
      logger.debug('GC executed successfully');
    } catch (e) {
      logger.debug('GC failed', { error: e });
    }
  }
}

/**
 * Log current memory usage
 */
function logMemoryUsage(context: string): void {
  const memUsage = process.memoryUsage();
  logger.info(`Memory [${context}]`, {
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
  });
}

/**
 * Process matching batch in background
 *
 * Memory Optimization (2025.01):
 * - 배치 간 GC 트리거
 * - 메모리 사용량 로깅
 * - 변수 명시적 해제
 * - 딜레이 증가 (1초 → 3초)
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

  logMemoryUsage('Matching Start');

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(companies.length / batchSize);

    logger.info(`Matching: Processing batch ${batchNum}/${totalBatches} (${batch.length} companies)`);

    for (const company of batch) {
      try {
        const preference = company.matchingPreferences[0];
        const firstMember = company.members[0];

        if (!preference || !firstMember) {
          logger.warn(`Matching: Skipping ${company.id} - missing preference or member`);
          continue;
        }

        // 매칭 실행 (결과를 즉시 처리하고 해제)
        let results = await executeMatching({
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

        const resultCount = results.length;

        if (resultCount > 0) {
          await storeMatchingResults(
            firstMember.userId,
            company.id,
            results
          );
          totalResultsStored += resultCount;
        }

        // Memory Optimization: 결과 배열 명시적 해제
        results = null as any;

        successCount++;
        logger.info(`Matching: ${company.name} - ${resultCount} matches stored`);

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Matching: Failed for ${company.id}`, { error: errorMessage });
      }
    }

    // Memory Optimization: 배치 간 메모리 정리
    if (i + batchSize < companies.length) {
      logMemoryUsage(`Batch ${batchNum} Complete`);
      tryGarbageCollection();
      // 딜레이 증가: 1초 → 3초 (GC 시간 확보)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  const duration = Date.now() - startTime;
  const durationMinutes = Math.round(duration / 1000 / 60 * 10) / 10;

  // Memory Optimization: 최종 메모리 상태 로깅 및 GC
  logMemoryUsage('Matching Complete');
  tryGarbageCollection();

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
 */
app.get('/matching/stats', async (req, res) => {
  try {
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
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
 */
const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  logger.info('Railway Embedding Worker Started', {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    healthCheck: `http://localhost:${PORT}/health`,
  });
});

/**
 * Graceful Shutdown
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
