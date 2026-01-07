/**
 * 첨부파일 없는 공고 재크롤링 스크립트
 *
 * detailUrl이 있지만 첨부파일이 없는 공고에 대해:
 * 1. 상세 페이지에서 첨부파일 URL 다시 추출
 * 2. 파일 다운로드 및 Storage 저장
 * 3. 텍스트 파싱
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/recrawl-missing-attachments.ts
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
  timeout: 60000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,
  timeout: 60000,
  rejectUnauthorized: false,
});

// Configuration
const CONFIG = {
  BATCH_SIZE: 10,
  MAX_PROJECTS: 10, // 한 번에 처리할 최대 프로젝트 수 (테스트용)
  REQUEST_TIMEOUT: 30000,
  DELAY_BETWEEN_PROJECTS: 2000, // ms
  DELAY_BETWEEN_FILES: 500, // ms
};

/**
 * Get crawler headers
 */
function getCrawlerHeaders(type: 'html' | 'file' = 'html', referer?: string, cookies?: string) {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const baseHeaders: Record<string, string> = {
    "User-Agent": userAgent,
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
  };

  if (type === 'file') {
    return {
      ...baseHeaders,
      "Accept": "application/octet-stream, */*",
      ...(referer ? { "Referer": referer } : {}),
      ...(cookies ? { "Cookie": cookies } : {}),
    };
  }

  return {
    ...baseHeaders,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

// FileType 타입 정의
type FileType = 'hwp' | 'hwpx' | 'pdf' | 'unknown';

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const axios = (await import('axios')).default;
  const { load } = await import('cheerio');
  const { uploadFile, getFileTypeFromName, shouldParseFile } = await import('../src/lib/supabase-storage');

  console.log('=== 첨부파일 없는 공고 재크롤링 ===\n');
  console.log(`설정: BATCH_SIZE=${CONFIG.BATCH_SIZE}, MAX_PROJECTS=${CONFIG.MAX_PROJECTS}`);
  console.log(`시작: ${new Date().toISOString()}\n`);

  // 첨부파일이 없고 detailUrl이 있는 프로젝트 조회
  const projectsWithoutAttachments = await prisma.supportProject.findMany({
    where: {
      deletedAt: null,
      detailUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      organization: true,
      detailUrl: true,
      sourceUrl: true,
      _count: {
        select: { attachments: true }
      }
    }
  });

  const targetProjects = projectsWithoutAttachments
    .filter(p => p._count.attachments === 0)
    .slice(0, CONFIG.MAX_PROJECTS);

  console.log(`재크롤링 대상: ${targetProjects.length}개 프로젝트\n`);

  if (targetProjects.length === 0) {
    console.log('재크롤링할 프로젝트가 없습니다.');
    await prisma.$disconnect();
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  let filesFound = 0;
  let filesParsed = 0;

  for (let i = 0; i < targetProjects.length; i++) {
    const project = targetProjects[i];
    console.log(`\n[${i + 1}/${targetProjects.length}] ${project.name.substring(0, 40)}...`);
    console.log(`  기관: ${project.organization}`);
    console.log(`  URL: ${project.detailUrl?.substring(0, 60)}...`);

    try {
      // 1. 상세 페이지 fetch
      let htmlContent: string;
      let cookies: string | undefined;

      try {
        const response = await axios.get(project.detailUrl!, {
          timeout: CONFIG.REQUEST_TIMEOUT,
          httpAgent,
          httpsAgent,
          headers: getCrawlerHeaders(),
        });
        htmlContent = response.data;

        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader && Array.isArray(setCookieHeader)) {
          cookies = setCookieHeader.map((c: string) => c.split(';')[0]).join('; ');
        }
      } catch (fetchError: any) {
        console.log(`  ❌ 페이지 로드 실패: ${fetchError.message}`);
        errorCount++;
        continue;
      }

      // 2. 파일 URL 추출
      const $ = load(htmlContent);
      const fileUrls: string[] = [];

      // 파일 링크 패턴 찾기
      $('a[href]').each((_, elem) => {
        const href = $(elem).attr('href') || '';
        const text = $(elem).text().trim();

        // 파일 다운로드 URL 패턴
        if (
          href.match(/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)$/i) ||
          href.includes('download') ||
          href.includes('fileDown') ||
          href.includes('getFile') ||
          href.includes('attachFile') ||
          (text && text.match(/\.(pdf|hwp|hwpx)$/i))
        ) {
          fileUrls.push(href);
        }
      });

      // onclick 이벤트에서 파일 URL 추출
      $('[onclick*="download"], [onclick*="file"], [onclick*="File"]').each((_, elem) => {
        const onclick = $(elem).attr('onclick') || '';
        const urlMatch = onclick.match(/['"]([^'"]+\.(pdf|hwp|hwpx)[^'"]*)['"]/i);
        if (urlMatch) {
          fileUrls.push(urlMatch[1]);
        }
      });

      // 중복 제거 및 절대 URL 변환
      const uniqueUrls = [...new Set(fileUrls)]
        .map(url => {
          if (url.startsWith('http')) return url;
          if (url.startsWith('/')) {
            const base = new URL(project.detailUrl!);
            return `${base.protocol}//${base.host}${url}`;
          }
          const base = new URL(project.detailUrl!);
          const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
          return `${base.protocol}//${base.host}${basePath}${url}`;
        })
        .filter(url => !url.includes('javascript:') && !url.includes('#'));

      console.log(`  📎 발견된 파일: ${uniqueUrls.length}개`);

      if (uniqueUrls.length === 0) {
        console.log('  ⏭️ 첨부파일 없음 (재확인)');
        continue;
      }

      filesFound += uniqueUrls.length;

      // 3. 파일 다운로드 및 처리
      for (const fileUrl of uniqueUrls) {
        const fileName = extractFileName(fileUrl);
        const fileType = getFileTypeFromName(fileName);
        const shouldParse = shouldParseFile(fileName);

        console.log(`    - ${fileName} (${fileType}, parse: ${shouldParse})`);

        try {
          // 다운로드
          const fileResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: CONFIG.REQUEST_TIMEOUT,
            httpAgent,
            httpsAgent,
            headers: getCrawlerHeaders('file', project.detailUrl!, cookies),
          });

          const buffer = Buffer.from(fileResponse.data);

          // Content-Disposition에서 실제 파일명 추출
          let actualFileName = fileName;
          const contentDisposition = fileResponse.headers['content-disposition'];
          if (contentDisposition) {
            const match = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'"\s;]+)/i);
            if (match) {
              actualFileName = decodeURIComponent(match[1]);
            }
          }

          // Storage에 업로드 (파싱 대상만)
          let storagePath: string | null = null;
          if (shouldParse && fileType !== 'unknown') {
            const uploadResult = await uploadFile(buffer, project.id, actualFileName, fileType);
            if (uploadResult.success) {
              storagePath = uploadResult.storagePath || null;
              console.log(`      ✅ Storage 저장: ${storagePath?.substring(0, 40)}...`);
            }
          }

          // 텍스트 파싱
          let parsedContent: string | null = null;
          let parseError: string | null = null;
          let isParsed = false;

          if (shouldParse) {
            try {
              const { parseDocument } = await import('../src/lib/document-parser');
              const result = await parseDocument(buffer, fileType as 'hwp' | 'hwpx' | 'pdf', 'text');
              if (result.success && result.text && result.text.length > 50) {
                parsedContent = result.text;
                isParsed = true;
                filesParsed++;
                console.log(`      ✅ 파싱 완료: ${result.text.length.toLocaleString()}자`);
              } else {
                parseError = 'No text extracted';
              }
            } catch (parseErr: any) {
              parseError = parseErr.message || 'Parse failed';
              console.log(`      ⚠️ 파싱 실패: ${parseError}`);
            }
          }

          // DB에 저장
          await prisma.projectAttachment.create({
            data: {
              projectId: project.id,
              fileName: actualFileName,
              fileType: fileType as string,
              fileSize: buffer.length,
              storagePath: storagePath,
              sourceUrl: fileUrl,
              shouldParse,
              isParsed,
              parsedContent,
              parseError,
            }
          });

          await sleep(CONFIG.DELAY_BETWEEN_FILES);
        } catch (downloadError: any) {
          console.log(`      ❌ 다운로드 실패: ${downloadError.message}`);

          // 실패해도 URL은 기록
          await prisma.projectAttachment.create({
            data: {
              projectId: project.id,
              fileName: fileName,
              fileType: fileType as string,
              fileSize: 0,
              storagePath: null,
              sourceUrl: fileUrl,
              shouldParse,
              isParsed: false,
              parseError: 'Download failed: ' + downloadError.message,
            }
          });
        }
      }

      successCount++;
    } catch (error: any) {
      console.log(`  ❌ 처리 실패: ${error.message}`);
      errorCount++;
    }

    await sleep(CONFIG.DELAY_BETWEEN_PROJECTS);
  }

  // 결과 요약
  console.log('\n' + '='.repeat(50));
  console.log('📊 재크롤링 결과');
  console.log('='.repeat(50));
  console.log(`처리된 프로젝트: ${successCount}/${targetProjects.length}`);
  console.log(`발견된 파일: ${filesFound}개`);
  console.log(`파싱 성공: ${filesParsed}개`);
  console.log(`에러 발생: ${errorCount}개`);
  console.log(`완료: ${new Date().toISOString()}`);

  await prisma.$disconnect();
}

/**
 * URL에서 파일명 추출
 */
function extractFileName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment.includes('.')) {
        return decodeURIComponent(lastSegment);
      }
    }

    // 쿼리 파라미터에서 파일명 추출 시도
    const params = urlObj.searchParams;
    for (const [key, value] of params.entries()) {
      if (key.toLowerCase().includes('name') || key.toLowerCase().includes('file')) {
        if (value.includes('.')) {
          return decodeURIComponent(value);
        }
      }
    }

    return `file_${Date.now()}.unknown`;
  } catch {
    return `file_${Date.now()}.unknown`;
  }
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
