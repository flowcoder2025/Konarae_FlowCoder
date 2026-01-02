/**
 * Railway Crawler Worker Server
 *
 * 크롤링 전용 워커 - Vercel Serverless 한계 극복
 * - 시간 제한 없음
 * - 백그라운드 작업 지원
 * - Keep-Alive 연결 재사용
 *
 * 실행: npm run worker:crawler
 *
 * 임베딩/매칭은 embedding-server.ts 참조
 */

import express from 'express';
import { processCrawlJob } from '@/lib/crawler/worker';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ lib: 'crawler-server' });

const app = express();

// JSON body parser
app.use(express.json());

// CORS 설정 (Vercel 도메인만 허용)
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

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

/**
 * Health Check Endpoint
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
 * POST /crawl
 *
 * Crawler Job Processing
 * Body: { jobId: string }
 * Headers: { Authorization: "Bearer {WORKER_API_KEY}" }
 */
app.post('/crawl', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WORKER_API_KEY}`;

    if (!authHeader || authHeader !== expectedAuth) {
      logger.error('Unauthorized request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      });
    }

    const { jobId } = req.body;
    if (!jobId || typeof jobId !== 'string') {
      logger.error('Invalid jobId', { jobId });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jobId is required and must be a string',
      });
    }

    logger.info(`Received crawl job: ${jobId}`);

    // 즉시 응답 (202 Accepted)
    res.status(202).json({
      accepted: true,
      jobId,
      message: 'Job queued for processing',
      timestamp: new Date().toISOString(),
    });

    // 백그라운드에서 크롤링 실행
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
 * POST /crawl/batch
 *
 * 여러 작업을 한 번에 처리
 */
app.post('/crawl/batch', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WORKER_API_KEY}`;

    if (!authHeader || authHeader !== expectedAuth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jobIds must be a non-empty array',
      });
    }

    logger.info(`Received batch crawl: ${jobIds.length} jobs`);

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
 * GET /test-parser
 *
 * Test connection to text_parser service
 */
app.get('/test-parser', async (req, res) => {
  const startTime = Date.now();
  const parserUrl = process.env.TEXT_PARSER_URL || 'https://textparser-production.up.railway.app';

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info(`Testing parser connection: ${parserUrl}`);

    const healthResponse = await fetch(`${parserUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    const healthData = await healthResponse.json().catch(() => null);

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
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
