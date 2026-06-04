/*
 * 파싱 실패한 첨부파일 재시도 스크립트
 *
 * 기본 동작은 dry-run입니다. 실제 DB 업데이트/파싱 실행은 --execute 또는
 * RETRY_PARSE_EXECUTE=true를 명시했을 때만 수행합니다.
 *
 * Dry run:
 *   set -a && source .env.local && set +a && npx tsx scripts/retry-parsing.ts --dry-run --limit=20 --scan-limit=1000
 *
 * Execute:
 *   set -a && source .env.local && set +a && npx tsx scripts/retry-parsing.ts --execute --limit=5 --scan-limit=500
 */

import * as dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import https from 'https';
import {
  buildParseRetryReport,
  classifyParseRetryError,
} from './retry-parsing-selection';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// HTTP Agents
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,
  timeout: 120000, // 2분으로 증가
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,
  timeout: 120000,
  rejectUnauthorized: false,
});

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(name);
const getNumberArg = (name: string, fallback: number) => {
  const prefix = `${name}=`;
  const raw = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const getPositiveEnvNumber = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Configuration
const CONFIG = {
  BATCH_SIZE: 20,
  MAX_FILES: getNumberArg('--limit', getPositiveEnvNumber('RETRY_PARSE_MAX_FILES', 20)),
  SCAN_LIMIT: getNumberArg('--scan-limit', getPositiveEnvNumber('RETRY_PARSE_SCAN_LIMIT', 1000)),
  MAX_FILE_SIZE_BYTES: getNumberArg(
    '--max-file-size-bytes',
    getPositiveEnvNumber('RETRY_PARSE_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024)
  ),
  PARSE_TIMEOUT: 120000, // 2분
  DELAY_BETWEEN_FILES: 500, // ms
  INCLUDE_UNKNOWN_ERRORS: hasFlag('--include-unknown-errors'),
  DRY_RUN:
    hasFlag('--dry-run') ||
    (!hasFlag('--execute') && process.env.RETRY_PARSE_EXECUTE !== 'true'),
};

/**
 * Detect file type from buffer magic bytes
 */
function detectFileType(buffer: Buffer): 'pdf' | 'hwp' | 'hwpx' | 'unknown' {
  if (buffer.length < 8) return 'unknown';

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }

  // HWP: D0 CF 11 E0 (OLE Compound Document)
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    return 'hwp';
  }

  // HWPX/ZIP: PK (50 4B)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'hwpx';
  }

  return 'unknown';
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  console.log('=== 파싱 실패 첨부파일 재시도 ===\n');
  console.log(
    `설정: MODE=${CONFIG.DRY_RUN ? 'DRY_RUN' : 'EXECUTE'}, BATCH_SIZE=${CONFIG.BATCH_SIZE}, MAX_FILES=${CONFIG.MAX_FILES}, SCAN_LIMIT=${CONFIG.SCAN_LIMIT}, MAX_FILE_SIZE_BYTES=${CONFIG.MAX_FILE_SIZE_BYTES}, INCLUDE_UNKNOWN_ERRORS=${CONFIG.INCLUDE_UNKNOWN_ERRORS}`
  );
  console.log(`시작: ${new Date().toISOString()}\n`);

  // 파싱 실패한 첨부파일 조회. 실제 retry 가능 여부는 shared helper에서 분류한다.
  const unparsedFiles = await prisma.projectAttachment.findMany({
    where: {
      shouldParse: true,
      isParsed: false,
      fileType: { in: ['pdf', 'hwp', 'hwpx'] },
      fileSize: { gt: 0, lte: CONFIG.MAX_FILE_SIZE_BYTES },
      parseError: { not: null },
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      storagePath: true,
      sourceUrl: true,
      parseError: true,
      project: {
        select: {
          id: true,
          name: true,
          detailUrl: true,
        }
      }
    },
    orderBy: [
      { updatedAt: 'asc' },
    ],
    take: CONFIG.SCAN_LIMIT,
  });

  const report = buildParseRetryReport(unparsedFiles, {
    maxFileSizeBytes: CONFIG.MAX_FILE_SIZE_BYTES,
    includeUnknownErrors: CONFIG.INCLUDE_UNKNOWN_ERRORS,
  });
  const orderedFiles = report.candidates.slice(0, CONFIG.MAX_FILES);

  printDryRunReport(report, orderedFiles);

  if (CONFIG.DRY_RUN) {
    console.log('\nDRY_RUN 모드입니다. Supabase 초기화, 파일 다운로드, 파싱, DB 업데이트를 수행하지 않습니다.');
    console.log('실행하려면 --execute를 명시하세요. 예: npx tsx scripts/retry-parsing.ts --execute --limit=5');
    await prisma.$disconnect();
    return;
  }

  if (orderedFiles.length === 0) {
    console.log('재시도할 파일이 없습니다.');
    await prisma.$disconnect();
    return;
  }

  const axios = (await import('axios')).default;
  const { createClient } = await import('@supabase/supabase-js');

  // Supabase 클라이언트 초기화
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < orderedFiles.length; i++) {
    const file = orderedFiles[i];
    const classification = classifyParseRetryError(file.parseError);
    console.log(`\n[${i + 1}/${orderedFiles.length}] ${file.fileName.substring(0, 50)}...`);
    console.log(`  Type: ${file.fileType} | Size: ${file.fileSize} bytes | Category: ${classification.label}`);
    console.log(`  Previous Error: ${file.parseError?.substring(0, 60) || 'None'}`);

    try {
      let buffer: Buffer | null = null;

      // 방법 1: Storage에서 다운로드
      if (file.storagePath) {
        console.log('  📦 Storage에서 다운로드 시도...');
        try {
          const { data, error } = await supabase.storage
            .from('project-files')
            .download(file.storagePath);

          if (error) {
            console.log(`  ⚠️ Storage 다운로드 실패: ${error.message}`);
          } else if (data) {
            buffer = Buffer.from(await data.arrayBuffer());
            console.log(`  ✅ Storage에서 ${buffer.length} bytes 다운로드`);
          }
        } catch (storageError: any) {
          console.log(`  ⚠️ Storage 오류: ${storageError.message}`);
        }
      }

      // 방법 2: sourceUrl에서 다운로드
      if (!buffer && file.sourceUrl) {
        console.log('  🌐 URL에서 다운로드 시도...');
        try {
          const referer = file.project.detailUrl || file.sourceUrl;
          const response = await axios.get(file.sourceUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            httpAgent,
            httpsAgent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/octet-stream, */*',
              'Referer': referer,
            },
          });

          buffer = Buffer.from(response.data);
          console.log(`  ✅ URL에서 ${buffer.length} bytes 다운로드`);
        } catch (downloadError: any) {
          console.log(`  ❌ URL 다운로드 실패: ${downloadError.message}`);
        }
      }

      if (!buffer) {
        console.log('  ⏭️ 다운로드 실패, 건너뜀');
        skipCount++;
        continue;
      }

      // 파일 타입 확인
      const detectedType = detectFileType(buffer);
      console.log(`  🔍 감지된 파일 타입: ${detectedType}`);

      if (detectedType === 'unknown') {
        console.log('  ⏭️ 알 수 없는 파일 형식, 건너뜀');
        skipCount++;
        continue;
      }

      // 파싱 시도
      console.log('  📄 파싱 시도...');
      let parsedContent: string | null = null;
      let parseError: string | null = null;

      try {
        // text_parser 서비스 사용
        const { parseDocument } = await import('../src/lib/document-parser');

        const parsePromise = parseDocument(buffer, detectedType, 'text');
        const result = await Promise.race([
          parsePromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Parse timeout')), CONFIG.PARSE_TIMEOUT)
          )
        ]);

        if (result.success && result.text.length > 50) {
          parsedContent = result.text.substring(0, 10000); // 10KB 제한
          console.log(`  ✅ 파싱 성공: ${parsedContent.length.toLocaleString()}자`);
        } else if (detectedType === 'hwp' || detectedType === 'hwpx') {
          console.log('  🔁 rhwp 로컬 fallback 시도...');
          const { parseHwpWithRhwp } = await import('../src/lib/rhwp-parser');
          const fallbackResult = await parseHwpWithRhwp(buffer);

          if (fallbackResult.success && fallbackResult.text.length > 50) {
            parsedContent = fallbackResult.text.substring(0, 10000); // 10KB 제한
            console.log(`  ✅ rhwp fallback 성공: ${parsedContent.length.toLocaleString()}자`);
          } else {
            parseError = fallbackResult.error || result.error || 'No text extracted';
            console.log(`  ⚠️ 텍스트 없음: ${parseError}`);
          }
        } else {
          parseError = result.error || 'No text extracted';
          console.log(`  ⚠️ 텍스트 없음: ${parseError}`);
        }
      } catch (parserError: any) {
        if (detectedType === 'hwp' || detectedType === 'hwpx') {
          console.log('  🔁 rhwp 로컬 fallback 시도...');
          const { parseHwpWithRhwp } = await import('../src/lib/rhwp-parser');
          const fallbackResult = await parseHwpWithRhwp(buffer);

          if (fallbackResult.success && fallbackResult.text.length > 50) {
            parsedContent = fallbackResult.text.substring(0, 10000); // 10KB 제한
            console.log(`  ✅ rhwp fallback 성공: ${parsedContent.length.toLocaleString()}자`);
          } else {
            parseError = fallbackResult.error || parserError.message || 'Parse failed';
            console.log(`  ❌ 파싱 실패: ${parseError}`);
          }
        } else {
          parseError = parserError.message || 'Parse failed';
          console.log(`  ❌ 파싱 실패: ${parseError}`);
        }
      }

      // DB 업데이트
      if (parsedContent) {
        await prisma.projectAttachment.update({
          where: { id: file.id },
          data: {
            isParsed: true,
            parsedContent,
            parseError: null,
            updatedAt: new Date(),
          }
        });
        successCount++;
      } else {
        await prisma.projectAttachment.update({
          where: { id: file.id },
          data: {
            parseError: parseError || 'Retry failed',
            updatedAt: new Date(),
          }
        });
        errorCount++;
      }

    } catch (error: any) {
      console.log(`  ❌ 처리 실패: ${error.message}`);
      errorCount++;

      // 에러 기록
      await prisma.projectAttachment.update({
        where: { id: file.id },
        data: {
          parseError: `Retry error: ${error.message}`,
          updatedAt: new Date(),
        }
      }).catch(() => {});
    }

    await sleep(CONFIG.DELAY_BETWEEN_FILES);
  }

  // 결과 요약
  console.log('\n' + '='.repeat(50));
  console.log('📊 파싱 재시도 결과');
  console.log('='.repeat(50));
  console.log(`처리된 파일: ${successCount + errorCount + skipCount}/${orderedFiles.length}`);
  console.log(`파싱 성공: ${successCount}개 ✅`);
  console.log(`파싱 실패: ${errorCount}개 ❌`);
  console.log(`건너뜀: ${skipCount}개 ⏭️`);
  console.log(`완료: ${new Date().toISOString()}`);

  // 최종 통계
  const finalStats = await prisma.projectAttachment.groupBy({
    by: ['isParsed'],
    where: { shouldParse: true },
    _count: { id: true }
  });

  console.log('\n📈 최종 파싱 상태:');
  finalStats.forEach(s => {
    const status = s.isParsed ? '✅ 파싱 완료' : '❌ 파싱 안됨';
    console.log(`  ${status}: ${s._count.id}개`);
  });

  await prisma.$disconnect();
}

function printDryRunReport<T extends {
  fileName: string;
  fileType: string;
  fileSize: number;
  parseError: string | null;
  storagePath: string | null;
  sourceUrl: string | null;
}>(
  report: ReturnType<typeof buildParseRetryReport<T>>,
  selectedFiles: T[]
): void {
  console.log('📊 파싱 retry 후보 리포트');
  console.log(`  스캔한 파일: ${report.totalScanned}개`);
  console.log(`  Retry 가능: ${report.retryableCount}개`);
  console.log(`  Terminal 제외: ${report.terminalCount}개`);
  console.log(`  Unknown 제외: ${report.unknownCount}개${CONFIG.INCLUDE_UNKNOWN_ERRORS ? ' (실행 후보 포함)' : ''}`);

  printCounts('Retry 가능 카테고리', report.retryableByCategory);
  printCounts('Terminal 카테고리', report.terminalByCategory);
  printCounts('Unknown 카테고리', report.unknownByCategory);

  console.log(`\n🎯 이번 실행 후보: ${selectedFiles.length}개 / 전체 후보 ${report.candidates.length}개`);
  selectedFiles.slice(0, 20).forEach((file, index) => {
    const classification = classifyParseRetryError(file.parseError);
    console.log(
      `  ${index + 1}. ${file.fileName.substring(0, 80)} | ${file.fileType} | ${file.fileSize} bytes | ${classification.label} | storage=${Boolean(file.storagePath)} | source=${Boolean(file.sourceUrl)} | error=${preview(file.parseError)}`
    );
  });
}

function printCounts(title: string, counts: Record<string, number>): void {
  console.log(`\n${title}:`);
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    console.log('  없음');
    return;
  }

  entries.forEach(([category, count]) => {
    console.log(`  ${category}: ${count}개`);
  });
}

function preview(value: string | null): string {
  if (!value) {
    return 'None';
  }

  return value.replace(/\s+/g, ' ').substring(0, 80);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
