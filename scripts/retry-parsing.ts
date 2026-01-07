/**
 * 파싱 실패한 첨부파일 재시도 스크립트
 *
 * shouldParse=true, isParsed=false인 첨부파일에 대해:
 * 1. Storage에서 파일 다운로드 (storagePath 있는 경우)
 * 2. 또는 sourceUrl에서 다시 다운로드
 * 3. 텍스트 파싱 재시도
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/retry-parsing.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import https from 'https';

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

// Configuration
const CONFIG = {
  BATCH_SIZE: 20,
  MAX_FILES: 20, // 한 번에 처리할 최대 파일 수 (테스트용)
  PARSE_TIMEOUT: 120000, // 2분
  DELAY_BETWEEN_FILES: 500, // ms
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
  const axios = (await import('axios')).default;
  const { createClient } = await import('@supabase/supabase-js');

  console.log('=== 파싱 실패 첨부파일 재시도 ===\n');
  console.log(`설정: BATCH_SIZE=${CONFIG.BATCH_SIZE}, MAX_FILES=${CONFIG.MAX_FILES}`);
  console.log(`시작: ${new Date().toISOString()}\n`);

  // Supabase 클라이언트 초기화
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 파싱 실패한 첨부파일 조회 (에러 유형별로 우선순위 지정)
  const unparsedFiles = await prisma.projectAttachment.findMany({
    where: {
      shouldParse: true,
      isParsed: false,
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
      { fileSize: 'desc' }, // 큰 파일 먼저 (더 많은 내용 가능성)
    ],
    take: CONFIG.MAX_FILES,
  });

  console.log(`파싱 재시도 대상: ${unparsedFiles.length}개 파일\n`);

  if (unparsedFiles.length === 0) {
    console.log('재시도할 파일이 없습니다.');
    await prisma.$disconnect();
    return;
  }

  // 에러 유형별 분류
  const errorGroups: Record<string, typeof unparsedFiles> = {};
  unparsedFiles.forEach(f => {
    const errorType = categorizeError(f.parseError || 'Unknown');
    if (!errorGroups[errorType]) errorGroups[errorType] = [];
    errorGroups[errorType].push(f);
  });

  console.log('📊 에러 유형별 분포:');
  Object.entries(errorGroups).forEach(([type, files]) => {
    console.log(`  ${type}: ${files.length}개`);
  });
  console.log('');

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  // 재시도 가능한 에러 유형 우선 처리
  const retryableErrors = ['timeout', 'Download Failed', 'Other'];
  const orderedFiles = [
    ...unparsedFiles.filter(f => retryableErrors.some(e =>
      categorizeError(f.parseError || '').toLowerCase().includes(e.toLowerCase())
    )),
    ...unparsedFiles.filter(f => !retryableErrors.some(e =>
      categorizeError(f.parseError || '').toLowerCase().includes(e.toLowerCase())
    ))
  ];

  for (let i = 0; i < orderedFiles.length; i++) {
    const file = orderedFiles[i];
    console.log(`\n[${i + 1}/${orderedFiles.length}] ${file.fileName.substring(0, 50)}...`);
    console.log(`  Type: ${file.fileType} | Size: ${file.fileSize} bytes`);
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
        } else {
          parseError = result.error || 'No text extracted';
          console.log(`  ⚠️ 텍스트 없음: ${parseError}`);
        }
      } catch (parserError: any) {
        parseError = parserError.message || 'Parse failed';
        console.log(`  ❌ 파싱 실패: ${parseError}`);
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

/**
 * 에러 메시지를 카테고리화
 */
function categorizeError(error: string): string {
  const lower = error.toLowerCase();

  if (lower.includes('download') || lower.includes('다운로드')) return 'Download Failed';
  if (lower.includes('timeout') || lower.includes('시간')) return 'Timeout';
  if (lower.includes('upload') || lower.includes('업로드')) return 'Upload Failed';
  if (lower.includes('no text') || lower.includes('empty')) return 'No Text';
  if (lower.includes('certificate')) return 'SSL Error';
  if (lower.includes('parse') || lower.includes('파싱')) return 'Parse Error';

  return 'Other';
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
