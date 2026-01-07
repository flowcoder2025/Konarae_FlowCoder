/**
 * Crawler Worker
 * Background worker for processing crawl jobs
 *
 * 파일 처리 흐름:
 * 1. 다운로드 → 2. Supabase 저장 → 3. 스마트 파싱 판단 → 4. 파싱 실행 → 5. DB 저장
 */

import { prisma } from "@/lib/prisma";
import http from "http";
import https from "https";
import {
  uploadFile,
  getFileTypeFromName,
  shouldParseFile,
  sortByParsingPriority,
  type FileType,
} from "@/lib/supabase-storage";
import { validateProject } from "@/lib/crawler/validators";
import { createLogger } from "@/lib/logger";
import { normalizeProject } from "@/lib/project-normalize";
import { processProjectDeduplication } from "@/lib/deduplication";
import {
  fetchWithPlaywright,
  isWafBlockedDomain,
  closeBrowser,
} from "@/lib/crawler/playwright-browser";

const logger = createLogger({ lib: "crawler-worker" });

/**
 * HTTP Agents with Keep-Alive for connection reuse
 * Critical for serverless environments to reduce connection overhead
 */
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,  // Railway 환경 고려 증가
  timeout: 60000,   // 60초로 증가
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,  // Railway 환경 고려 증가
  timeout: 60000,   // 60초로 증가
  // Development: SSL 검증 우회 (일부 사이트의 인증서 문제 해결)
  // Production: 환경변수로 제어 가능
  rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
});

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get crawler headers to avoid bot detection
 * Updated to Chrome 131 (2025.01) with realistic browser fingerprint
 */
function getCrawlerHeaders(
  type: 'html' | 'json' | 'file' = 'html',
  referer?: string,
  cookies?: string
): Record<string, string> {
  // Chrome 131 User-Agent (2025.01 latest)
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const baseHeaders: Record<string, string> = {
    "User-Agent": userAgent,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Upgrade-Insecure-Requests": "1",
  };

  switch (type) {
    case 'json':
      return {
        ...baseHeaders,
        "Accept": "application/json, text/plain, */*",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      };
    case 'file':
      return {
        ...baseHeaders,
        "Accept": "application/octet-stream, application/pdf, application/x-hwp, */*",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        ...(referer ? { "Referer": referer } : {}),
        ...(cookies ? { "Cookie": cookies } : {}),
      };
    case 'html':
    default:
      return {
        ...baseHeaders,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      };
  }
}

/**
 * Parse Korean currency text to number
 * Handles formats like "4억원", "500만원", "3천만원", "1억 5천만원", "최대 400만원"
 *
 * @param text Korean currency text
 * @returns Parsed number in KRW, or null if parsing fails
 */
function parseKoreanAmount(text: string | undefined | null): number | null {
  if (!text) return null;

  // Clean the text: remove spaces, commas, and extract numbers
  const cleanText = text.replace(/[,\s]/g, '');

  // Try to extract numeric value with Korean units
  // Pattern: numbers + optional units (억, 천만, 백만, 만, 원)
  // Examples: "4억", "500만원", "3천만원", "1억5천만원", "4억원", "최대 400만원"

  let total = 0;
  let matched = false;

  // Pattern for 억 (100 million)
  const eokMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eokMatch) {
    total += parseFloat(eokMatch[1]) * 100000000;
    matched = true;
  }

  // Pattern for 천만 (10 million)
  const cheonmanMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*천만/);
  if (cheonmanMatch) {
    total += parseFloat(cheonmanMatch[1]) * 10000000;
    matched = true;
  }

  // Pattern for 백만 (1 million)
  const baekmanMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*백만/);
  if (baekmanMatch) {
    total += parseFloat(baekmanMatch[1]) * 1000000;
    matched = true;
  }

  // Pattern for 만 (10 thousand) - but not 천만 or 백만
  const manMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*만(?![\u4E00-\u9FA5])/);
  if (manMatch && !cheonmanMatch && !baekmanMatch) {
    total += parseFloat(manMatch[1]) * 10000;
    matched = true;
  }

  // If no Korean units matched, try to find raw number
  if (!matched) {
    // Try to find a number with optional "원" suffix
    const rawMatch = cleanText.match(/(\d{1,3}(?:,?\d{3})*(?:\.\d+)?)\s*원?$/);
    if (rawMatch) {
      const numStr = rawMatch[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) {
        total = num;
        matched = true;
      }
    }
  }

  return matched && total > 0 ? total : null;
}

/**
 * Extract amount range from text
 * Handles patterns like:
 * - "최대 4억원" → { min: null, max: 400000000 }
 * - "500만원 ~ 1억원" → { min: 5000000, max: 100000000 }
 * - "최소 1천만원 ~ 최대 5천만원" → { min: 10000000, max: 50000000 }
 * - "업체당 500만원 이내" → { min: null, max: 5000000 }
 *
 * @param text Amount description text
 * @returns { amountMin, amountMax } parsed values
 */
function extractAmountRange(text: string | undefined | null): { amountMin: number | null; amountMax: number | null } {
  if (!text) return { amountMin: null, amountMax: null };

  const cleanText = text.replace(/[,\s]+/g, ' ').trim();

  // Pattern 1: Range with separator (~ or -)
  // e.g., "500만원 ~ 1억원", "1천만원-5천만원"
  const rangeMatch = cleanText.match(/(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)\s*[~\-～]\s*(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)/);
  if (rangeMatch) {
    return {
      amountMin: parseKoreanAmount(rangeMatch[1]),
      amountMax: parseKoreanAmount(rangeMatch[2]),
    };
  }

  // Pattern 2: "최대 X" or "X 이내" or "X까지"
  const maxOnlyMatch = cleanText.match(/(?:최대|이내|까지|한도)\s*(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)|(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)\s*(?:이내|까지|한도)/);
  if (maxOnlyMatch) {
    const amountText = maxOnlyMatch[1] || maxOnlyMatch[2];
    return {
      amountMin: null,
      amountMax: parseKoreanAmount(amountText),
    };
  }

  // Pattern 3: "최소 X" or "X 이상"
  const minOnlyMatch = cleanText.match(/(?:최소|이상)\s*(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)|(\d+(?:\.\d+)?\s*(?:억|천만|백만|만)?원?)\s*(?:이상)/);
  if (minOnlyMatch) {
    const amountText = minOnlyMatch[1] || minOnlyMatch[2];
    return {
      amountMin: parseKoreanAmount(amountText),
      amountMax: null,
    };
  }

  // Pattern 4: Single amount - treat as max
  const singleAmount = parseKoreanAmount(cleanText);
  if (singleAmount) {
    return {
      amountMin: null,
      amountMax: singleAmount,
    };
  }

  return { amountMin: null, amountMax: null };
}

/**
 * Fetch with retry and exponential backoff
 * Handles transient network errors common in serverless environments
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  options: {
    retries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 8000,
    shouldRetry = (error: any) => {
      // Retry on common transient errors
      const retryableCodes = ['EPIPE', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ERR_BAD_RESPONSE'];
      return retryableCodes.includes(error?.code) ||
             error?.message?.includes('timeout') ||
             error?.message?.includes('EPIPE');
    }
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchFn();
    } catch (error: any) {
      lastError = error;

      if (attempt < retries - 1 && shouldRetry(error)) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, { errorCode: error.code || error.message, delay });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Process a single crawl job
 * This is a stub implementation - actual crawling logic would be project-specific
 */
export async function processCrawlJob(jobId: string) {
  try {
    // Get job details
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      include: {
        source: true,
      },
    });

    if (!job) {
      throw new Error("Job not found");
    }

    // Update job status to running
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    // Actual crawling and parsing
    logger.info(`Starting crawl: ${job.source.url} (${job.source.type})`);
    const crawledProjects = await crawlAndParse(
      job.source.url,
      job.source.type
    );

    logger.info(`Found ${crawledProjects.length} projects`);

    // Test mode: Limit to sample projects if TEST_MAX_PROJECTS is set
    const maxProjects = process.env.TEST_MAX_PROJECTS ? parseInt(process.env.TEST_MAX_PROJECTS, 10) : undefined;
    const projectsToProcess = maxProjects ? crawledProjects.slice(0, maxProjects) : crawledProjects;

    if (maxProjects && crawledProjects.length > maxProjects) {
      logger.warn(`TEST MODE: Processing only first ${maxProjects} projects (total: ${crawledProjects.length})`);
    }

    // Save projects to database (includes file processing)
    logger.info("Step 3+4: Saving projects and processing files");
    const { newCount, updatedCount, filesProcessed } = await saveProjects(projectsToProcess);

    logger.info("Crawl Summary", { newCount, updatedCount, filesProcessed });

    // Update job status to completed
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        projectsFound: crawledProjects.length,
        projectsNew: newCount,
        projectsUpdated: updatedCount,
      },
    });

    // Update source lastCrawled timestamp
    await prisma.crawlSource.update({
      where: { id: job.sourceId },
      data: { lastCrawled: new Date() },
    });

    const stats = {
      projectsFound: crawledProjects.length,
      projectsNew: newCount,
      projectsUpdated: updatedCount,
      filesProcessed,
    };

    logger.info(`Crawl job ${jobId} completed successfully`, stats);

    // Playwright 브라우저 정리
    await closeBrowser();

    return stats;
  } catch (error) {
    logger.error(`Crawl job ${jobId} failed`, { error });

    // Playwright 브라우저 정리 (에러 발생 시에도)
    await closeBrowser().catch(() => {});

    // Update job status to failed
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

/**
 * Parse crawled data into SupportProject format
 * PRD Feature 1 compliance: 지원사업 크롤링 & 정보 요약
 */
interface CrawledProject {
  externalId?: string;
  name: string;
  organization: string;
  category: string;
  subCategory?: string;
  target: string;
  region: string;
  amountMin?: bigint;
  amountMax?: bigint;
  amountDescription?: string;
  startDate?: Date;
  endDate?: Date;
  deadline?: Date;
  isPermanent?: boolean;
  summary: string;
  description?: string;
  eligibility?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
  requiredDocuments?: string[];
  contactInfo?: string;
  websiteUrl?: string;
  originalFileUrl?: string;
  originalFileType?: string;
  sourceUrl: string;
  detailUrl?: string;
  attachmentUrls?: string[];
  // 저장된 첨부파일 정보
  savedAttachments?: SavedAttachment[];
  // 세션 쿠키 (파일 다운로드용)
  cookies?: string;
}

/**
 * Supabase에 저장된 첨부파일 정보
 */
interface SavedAttachment {
  fileName: string;
  fileType: FileType;
  fileSize: number;
  storagePath: string;
  sourceUrl: string;
  shouldParse: boolean;
  isParsed: boolean;
  parsedContent?: string;
  parseError?: string;
}

/**
 * Extract file URLs from detail page
 * Finds HWP, HWPX, PDF attachment links
 * Supports both 기업마당 (bizinfo.go.kr) and K-Startup (k-startup.go.kr)
 */
function extractFileUrls(
  $: ReturnType<typeof import("cheerio")["load"]>,
  detailUrl?: string
): string[] {
  const fileUrls: string[] = [];

  // Detect site type from URL
  const isKStartup = detailUrl?.includes('k-startup.go.kr') || false;
  const isTechnopark = detailUrl?.includes('technopark.kr') || false;

  // ===== K-Startup specific pattern =====
  // HTML 구조:
  // <div class="board_file">
  //   <a class="file_bg" title="[첨부파일] 파일명.pdf">...</a>
  //   <a href="/afile/fileDownload/gT8Ln" class="btn_down">
  // </div>
  if (isKStartup) {
    logger.debug("Using K-Startup file extractor");

    // Method 1: Find .btn_down links (download buttons)
    $('a.btn_down').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !fileUrls.includes(href)) {
        fileUrls.push(href);
      }
    });

    // Method 2: Find links in board_file container
    $('.board_file a[href*="/afile/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !fileUrls.includes(href)) {
        fileUrls.push(href);
      }
    });

    // Method 3: Find any /afile/fileDownload/ links
    $('a[href*="/afile/fileDownload/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !fileUrls.includes(href)) {
        fileUrls.push(href);
      }
    });

    if (fileUrls.length > 0) {
      logger.debug(`Found ${fileUrls.length} K-Startup file(s)`);
      return fileUrls;
    }
  }

  // ===== Technopark specific pattern =====
  // HTML 구조:
  // <div>첨부파일</div>
  // <ul>
  //   <li><a href="/?module=file&act=procFileDownload&file_srl=...">파일명.pdf</a></li>
  // </ul>
  if (isTechnopark) {
    logger.debug("Using Technopark file extractor");

    // Extract base URL from detailUrl
    const baseUrl = detailUrl ? new URL(detailUrl).origin : 'https://www.technopark.kr';

    // Find links with procFileDownload pattern
    $('a[href*="procFileDownload"]').each((_, element) => {
      let href = $(element).attr('href');
      if (href) {
        // Convert relative URL to absolute URL
        if (href.startsWith('?') || href.startsWith('/')) {
          href = href.startsWith('?') ? `${baseUrl}/${href}` : `${baseUrl}${href}`;
        }
        if (!fileUrls.includes(href)) {
          fileUrls.push(href);
        }
      }
    });

    if (fileUrls.length > 0) {
      logger.debug(`Found ${fileUrls.length} Technopark file(s)`);
      return fileUrls;
    }
  }

  // ===== 기업마당 specific pattern =====
  // Find "첨부파일" or "본문출력파일" sections
  $('h3').each((_, heading) => {
    const headingText = $(heading).text().trim();

    if (headingText === "첨부파일" || headingText === "본문출력파일") {
      // Find the list following this heading
      let $list = $(heading).next('ul');

      // If not immediately next, search nearby siblings
      if ($list.length === 0) {
        $list = $(heading).parent().find('ul').first();
      }

      // Extract download links from list items
      $list.find('li').each((_, item) => {
        // Look for "다운로드" link
        const $downloadLink = $(item).find('a').filter((_, link) => {
          return $(link).text().trim() === "다운로드";
        });

        const href = $downloadLink.attr('href');
        if (href && !fileUrls.includes(href)) {
          fileUrls.push(href);
        }
      });
    }
  });

  // Fallback: Direct search for bizinfo file download pattern
  $('a[href*="/cmm/fms/getImageFile.do"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && !fileUrls.includes(href)) {
      fileUrls.push(href);
    }
  });

  // Generic fallback for other government sites
  const genericSelectors = [
    'a[href*=".hwp"]',
    'a[href*=".hwpx"]',
    'a[href*=".pdf"]',
    'a[href*="download"]',
    'a[href*="attach"]',
    '.file a',
    '.attachment a',
  ];

  genericSelectors.forEach((selector) => {
    $(selector).each((_, element) => {
      const href = $(element).attr("href");
      if (href && !fileUrls.includes(href)) {
        const extensions = [".hwp", ".hwpx", ".pdf", "getImageFile", "download"];
        const hasValidPattern = extensions.some((ext) => href.toLowerCase().includes(ext));
        if (hasValidPattern) {
          fileUrls.push(href);
        }
      }
    });
  });

  return fileUrls;
}

/**
 * Detail page extracted information
 * 상세 페이지 HTML에서 추출한 정보
 */
interface DetailPageInfo {
  // 지원금액
  amountMin?: number;
  amountMax?: number;
  fundingSummary?: string;
  amountDescription?: string;
  // 사업 내용
  summary?: string;
  description?: string;
  eligibility?: string;
  target?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
  contactInfo?: string;
  // 일정
  deadline?: Date;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Extract project info from detail page HTML
 * 상세 페이지에서 금액, 설명, 자격요건 등 추출
 *
 * 지원되는 사이트:
 * - 기업마당 (bizinfo.go.kr): 테이블 기반 레이아웃
 * - K-Startup (k-startup.go.kr): 테이블/리스트 기반
 * - 테크노파크: 다양한 레이아웃
 */
function extractDetailPageInfo(
  $: ReturnType<typeof import("cheerio")["load"]>,
  detailUrl: string
): DetailPageInfo {
  const info: DetailPageInfo = {};

  // 사이트 타입 감지
  const isBizinfo = detailUrl.includes('bizinfo.go.kr');
  const isKStartup = detailUrl.includes('k-startup.go.kr');

  // ===== 공통: 테이블에서 정보 추출 =====
  // 패턴: <th>라벨</th><td>값</td> 또는 <dt>라벨</dt><dd>값</dd>

  const labelValuePairs: { label: string; value: string }[] = [];

  // 테이블 행에서 추출
  $('table tr').each((_, tr) => {
    const $tr = $(tr);
    const th = $tr.find('th').text().trim();
    const td = $tr.find('td').text().trim();
    if (th && td) {
      labelValuePairs.push({ label: th, value: td });
    }
  });

  // dl/dt/dd 구조에서 추출
  $('dl').each((_, dl) => {
    const $dl = $(dl);
    $dl.find('dt').each((idx, dt) => {
      const label = $(dt).text().trim();
      const dd = $dl.find('dd').eq(idx);
      const value = dd.text().trim();
      if (label && value) {
        labelValuePairs.push({ label, value });
      }
    });
  });

  // 라벨-값 쌍에서 정보 추출
  for (const { label, value } of labelValuePairs) {
    const labelLower = label.toLowerCase().replace(/\s/g, '');

    // 지원금액
    if (labelLower.includes('지원금액') || labelLower.includes('지원규모') ||
        labelLower.includes('보조금') || labelLower.includes('지원한도') ||
        labelLower.includes('사업비') || labelLower.includes('지원내용')) {
      // 금액 정보가 있으면 파싱
      const amountRange = extractAmountRange(value);
      if (amountRange.amountMin || amountRange.amountMax) {
        info.amountMin = amountRange.amountMin ?? undefined;
        info.amountMax = amountRange.amountMax ?? undefined;
        info.fundingSummary = value.substring(0, 50).trim();
        info.amountDescription = value;
      } else if (!info.amountDescription && value.length > 10) {
        // 금액 파싱 실패해도 설명은 저장
        info.amountDescription = value;
      }
    }

    // 사업 개요/내용
    if (labelLower.includes('사업개요') || labelLower.includes('사업내용') ||
        labelLower.includes('사업목적') || labelLower.includes('지원내용')) {
      if (!info.description && value.length > 20) {
        info.description = value.substring(0, 2000);
      }
    }

    // 지원 대상
    if (labelLower.includes('지원대상') || labelLower.includes('모집대상') ||
        labelLower.includes('신청대상') || labelLower.includes('참여대상')) {
      if (!info.target) {
        info.target = value.substring(0, 500);
      }
    }

    // 신청 자격
    if (labelLower.includes('신청자격') || labelLower.includes('지원자격') ||
        labelLower.includes('참여자격') || labelLower.includes('자격요건')) {
      if (!info.eligibility) {
        info.eligibility = value.substring(0, 1000);
      }
    }

    // 신청 방법/절차
    if (labelLower.includes('신청방법') || labelLower.includes('신청절차') ||
        labelLower.includes('접수방법') || labelLower.includes('지원절차')) {
      if (!info.applicationProcess) {
        info.applicationProcess = value.substring(0, 1000);
      }
    }

    // 평가 기준
    if (labelLower.includes('평가기준') || labelLower.includes('선정기준') ||
        labelLower.includes('심사기준')) {
      if (!info.evaluationCriteria) {
        info.evaluationCriteria = value.substring(0, 1000);
      }
    }

    // 문의처
    if (labelLower.includes('문의') || labelLower.includes('담당자') ||
        labelLower.includes('연락처')) {
      if (!info.contactInfo) {
        info.contactInfo = value.substring(0, 200);
      }
    }

    // 접수 기간/마감일
    if (labelLower.includes('접수기간') || labelLower.includes('신청기간') ||
        labelLower.includes('모집기간')) {
      const dateMatches = value.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
      if (dateMatches && dateMatches.length >= 1) {
        // 첫 번째 날짜는 시작일, 두 번째는 마감일
        try {
          if (dateMatches.length >= 2) {
            info.startDate = new Date(dateMatches[0].replace(/[.\-/]/g, '-'));
            info.deadline = new Date(dateMatches[1].replace(/[.\-/]/g, '-'));
          } else {
            info.deadline = new Date(dateMatches[0].replace(/[.\-/]/g, '-'));
          }
        } catch {
          // 날짜 파싱 실패 무시
        }
      }
    }
  }

  // ===== 기업마당 특화 파싱 =====
  if (isBizinfo) {
    // 본문 영역에서 추가 정보 추출
    const contentArea = $('.view_cont, .bbs-view, .board-view').text();
    if (contentArea && !info.description) {
      // 본문이 충분히 길면 요약으로 사용
      const cleanContent = contentArea.replace(/\s+/g, ' ').trim();
      if (cleanContent.length > 100) {
        info.description = cleanContent.substring(0, 2000);
      }
    }
  }

  // ===== K-Startup 특화 파싱 =====
  if (isKStartup) {
    // K-Startup 상세 페이지 구조 파싱
    $('.cont_box, .view_cont').each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();

      // 금액 패턴 찾기
      if (!info.amountMax && (text.includes('지원금액') || text.includes('억원') || text.includes('만원'))) {
        const amountRange = extractAmountRange(text);
        if (amountRange.amountMax) {
          info.amountMin = amountRange.amountMin ?? undefined;
          info.amountMax = amountRange.amountMax ?? undefined;
        }
      }
    });
  }

  // ===== summary 생성 =====
  // 추출된 정보로 요약 생성
  if (!info.summary) {
    const parts: string[] = [];
    if (info.target) {
      parts.push(info.target.substring(0, 30));
    }
    if (info.fundingSummary) {
      parts.push(info.fundingSummary);
    } else if (info.amountMax) {
      const formatted = info.amountMax >= 100000000
        ? `${(info.amountMax / 100000000).toFixed(0)}억원`
        : `${(info.amountMax / 10000).toFixed(0)}만원`;
      parts.push(`최대 ${formatted}`);
    }
    if (parts.length > 0) {
      info.summary = parts.join(' 대상 ');
    }
  }

  return info;
}

/**
 * Fetch detail page and extract file URLs + project info
 * Enhanced with retry logic and HTTP agents for Vercel compatibility
 * NEW: 상세 페이지 HTML에서 금액, 설명 등 정보도 추출
 */
async function fetchDetailPage(
  detailUrl: string,
  baseUrl: string
): Promise<{ fileUrls: string[]; cookies?: string; detailInfo?: DetailPageInfo }> {
  try {
    const axios = (await import("axios")).default;
    const { load } = await import("cheerio");

    logger.debug(`Fetching detail page: ${detailUrl}`);

    let htmlContent: string;
    let cookies: string | undefined;

    // WAF 차단 도메인은 Playwright 사용
    if (isWafBlockedDomain(detailUrl)) {
      const { html, cookies: playwrightCookies } = await fetchWithPlaywright(detailUrl, {
        timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
      });
      htmlContent = html;
      cookies = playwrightCookies;
    } else {
      // 일반 도메인은 axios 사용, 실패 시 Playwright fallback
      try {
        const response = await fetchWithRetry(
          () => axios.get(detailUrl, {
            timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
            httpAgent,
            httpsAgent,
            headers: getCrawlerHeaders(),
          }),
          { retries: 2, initialDelayMs: 1000 }
        );
        htmlContent = response.data;

        // Extract cookies from Set-Cookie header
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader && Array.isArray(setCookieHeader)) {
          cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
          logger.debug("Saved session cookies for file download");
        }
      } catch (axiosError: any) {
        // ERR_BAD_REQUEST 또는 403/503 에러 시 Playwright fallback
        const errorCode = axiosError.code || "";
        const statusCode = axiosError.response?.status;
        if (errorCode === "ERR_BAD_REQUEST" || statusCode === 403 || statusCode === 503) {
          logger.debug(`[Playwright] Fallback for detail page: ${detailUrl}`);
          const { html, cookies: playwrightCookies } = await fetchWithPlaywright(detailUrl, {
            timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
          });
          htmlContent = html;
          cookies = playwrightCookies;
        } else {
          throw axiosError;
        }
      }
    }

    const $ = load(htmlContent);
    const fileUrls = extractFileUrls($, detailUrl);

    // NEW: 상세 페이지에서 금액, 설명 등 정보 추출
    const detailInfo = extractDetailPageInfo($, detailUrl);
    if (detailInfo.amountMax || detailInfo.description || detailInfo.eligibility) {
      logger.debug("Extracted detail info", {
        hasAmount: !!detailInfo.amountMax,
        hasDescription: !!detailInfo.description,
        hasEligibility: !!detailInfo.eligibility,
      });
    }

    // Convert relative URLs to absolute
    const absoluteUrls = fileUrls.map((url) => {
      if (url.startsWith("http")) {
        return url;
      } else if (url.startsWith("/")) {
        const base = new URL(baseUrl);
        return `${base.protocol}//${base.host}${url}`;
      } else {
        const base = new URL(detailUrl);
        const basePath = base.pathname.substring(0, base.pathname.lastIndexOf("/") + 1);
        return `${base.protocol}//${base.host}${basePath}${url}`;
      }
    });

    logger.debug(`Found ${absoluteUrls.length} file(s)`);
    return { fileUrls: absoluteUrls, cookies, detailInfo };
  } catch (error: any) {
    logger.error(`Failed to fetch detail page ${detailUrl}`, { errorCode: error.code || error.message });
    return { fileUrls: [], cookies: undefined, detailInfo: undefined };
  }
}

/**
 * Download result with buffer and actual filename
 */
interface DownloadResult {
  buffer: Buffer;
  fileName: string | null; // 실제 파일명 (Content-Disposition에서 추출)
}

/**
 * Check if a string contains valid Korean characters
 */
function hasValidKorean(str: string): boolean {
  // Check for Korean syllables (가-힣)
  return /[\uAC00-\uD7AF]/.test(str) && !str.includes('�');
}

/**
 * Check if filename appears corrupted
 * Detects common encoding corruption patterns
 */
function isCorruptedFileName(fileName: string): boolean {
  // Pattern A: Separated Korean jamo (ㅊ, ㅋ, ㅌ appearing frequently)
  // These characters appear when UTF-8 bytes are misinterpreted as EUC-KR
  const jamoPattern = /[\u3131-\u3163\u314F-\u3163]{2,}/;

  // Pattern B: Latin-1 UTF-8 corruption (Ã, Â appearing together)
  const latin1Pattern = /[ÃÂ]{2,}|Ã[\x80-\xBF]/;

  // Pattern C: Replacement character
  const replacementPattern = /\uFFFD/;

  // Pattern D: Chinese-looking characters that shouldn't be in Korean filenames
  // (Often result of wrong encoding interpretation)
  const suspiciousChinesePattern = /[\u4E00-\u9FFF]{3,}/;

  // Pattern E: Extended corruption pattern - Korean syllables with rare vowel/consonant combinations
  // Characters like 혚, 혞, 혱, 혗, 쨀, 혶, 쨉, 짠, 쨋, 혻, 혵 etc.
  // These appear when UTF-8 bytes are decoded as CP949/EUC-KR
  const extendedCorruptionPattern = /[혚혞혱혗쨀혶쨉짠쨋혻혵혲혷혙혢짼짯쨍혩혰혮쩍혳혬쨔쨈혡혛쨌쩌쨊쨁짢짧짜짧짤짭짖쩐쩔쩜혰혫혜혝혟혤혯혼횁횃횅횆횉횊횋횎횏횐횑횒횓횔횕횖횗횘횙횚횛횜혮혯]/g;
  const hasExtendedCorruption = (fileName.match(extendedCorruptionPattern) || []).length >= 2;

  // Pattern F: Common mojibake patterns - consecutive unusual syllables
  // 챙혞, 챘혚, 챗쨀 type patterns (UTF-8 → CP949 misread)
  const mojibakePattern = /[챘챙챗챠챨챵챶챷챸챹챺챻챼챽챾챿쨀쨁쨂쨃쨄쨅쨆쨇쨈쨉쨊쨋쨌쨍쨎쨏]/g;
  const hasMojibake = (fileName.match(mojibakePattern) || []).length >= 2;

  return jamoPattern.test(fileName) ||
         latin1Pattern.test(fileName) ||
         replacementPattern.test(fileName) ||
         suspiciousChinesePattern.test(fileName) ||
         hasExtendedCorruption ||
         hasMojibake;
}

/**
 * Attempt to repair a corrupted filename
 * Tries multiple decoding strategies
 */
async function repairCorruptedFileName(fileName: string): Promise<string> {
  const iconv = (await import('iconv-lite')).default;

  // Strategy 0 (PRIORITY): Double encoding - CP949 → UTF-8 → Latin-1 → UTF-8
  // This handles the most common case: 챘혚혙 → 년 type corruption
  // UTF-8 bytes were wrongly decoded as CP949, then displayed incorrectly
  try {
    const cp949Bytes = iconv.encode(fileName, "cp949");
    const step1 = cp949Bytes.toString("utf-8");
    const latin1Bytes = Buffer.from(step1, "latin1");
    const final = latin1Bytes.toString("utf-8");
    if (hasValidKorean(final) && !isCorruptedFileName(final)) {
      logger.debug(`Repaired filename (Double CP949): "${fileName}" → "${final}"`);
      return final;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 1: Latin-1 → UTF-8 (most common for Ã patterns)
  try {
    let isLatin1Range = true;
    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        isLatin1Range = false;
        break;
      }
    }

    if (isLatin1Range) {
      const bytes = Buffer.from(fileName, 'latin1');
      const utf8Decoded = bytes.toString('utf-8');
      if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
        return utf8Decoded;
      }
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Try to recover from EUC-KR misinterpretation
  // When UTF-8 bytes are read as EUC-KR, we need to reverse it
  try {
    // Encode back to EUC-KR bytes, then decode as UTF-8
    const eucKrBytes = iconv.encode(fileName, 'euc-kr');
    const utf8Decoded = eucKrBytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      return utf8Decoded;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2.5: Double encoding recovery (EUC-KR variant)
  try {
    const eucKrBytes = iconv.encode(fileName, "euc-kr");
    const step1 = eucKrBytes.toString("utf-8");
    const latin1Bytes = Buffer.from(step1, "latin1");
    const final = latin1Bytes.toString("utf-8");
    if (hasValidKorean(final) && !isCorruptedFileName(final)) {
      logger.debug(`Repaired filename (Double EUC-KR): "${fileName}" → "${final}"`);
      return final;
    }
  } catch {
    // Continue
  }

  // Strategy 3: Double UTF-8 encoding recovery
  try {
    // First decode assuming it's UTF-8 bytes stored as Latin-1
    let bytes: Buffer | null = null;
    let allInRange = true;

    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        allInRange = false;
        break;
      }
    }

    if (allInRange) {
      bytes = Buffer.from(fileName, 'latin1');
    } else {
      // Try encoding as UTF-8 first
      bytes = Buffer.from(fileName, 'utf-8');
    }

    if (bytes) {
      // Try EUC-KR decode
      const eucKrDecoded = iconv.decode(bytes, 'euc-kr');
      if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
        return eucKrDecoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 4: CP949 (extended EUC-KR)
  try {
    let allInRange = true;
    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        allInRange = false;
        break;
      }
    }

    if (allInRange) {
      const bytes = Buffer.from(fileName, 'latin1');
      const cp949Decoded = iconv.decode(bytes, 'cp949');
      if (hasValidKorean(cp949Decoded) && !isCorruptedFileName(cp949Decoded)) {
        return cp949Decoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 5: CP949 → UTF-8 reverse (for 챗쩻햇챙멜헐 type corruption)
  // When UTF-8 Korean text is wrongly decoded as CP949, we need to:
  // 1. Encode the corrupted string back to CP949 bytes
  // 2. Decode those bytes as UTF-8
  try {
    const cp949Bytes = iconv.encode(fileName, 'cp949');
    const utf8Decoded = cp949Bytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      logger.debug(`Repaired filename (CP949→UTF-8): "${fileName}" → "${utf8Decoded}"`);
      return utf8Decoded;
    }
  } catch {
    // Continue
  }

  // Strategy 6: EUC-KR → UTF-8 reverse (similar to Strategy 5 but for EUC-KR)
  try {
    const eucKrBytes = iconv.encode(fileName, 'euc-kr');
    const utf8Decoded = eucKrBytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      logger.debug(`Repaired filename (EUC-KR→UTF-8): "${fileName}" → "${utf8Decoded}"`);
      return utf8Decoded;
    }
  } catch {
    // Continue
  }

  // No repair successful, return original
  return fileName;
}

/**
 * Extract filename from Content-Disposition header
 * Handles ASCII, UTF-8, EUC-KR, and various encoding issues
 * common in Korean government sites
 */
async function extractFileNameFromHeader(contentDisposition: string | undefined): Promise<string | null> {
  if (!contentDisposition) return null;

  const iconv = (await import('iconv-lite')).default;

  // 1. Try filename*=UTF-8''encoded_name (RFC 5987) - most reliable
  const utf8Match = contentDisposition.match(/filename\*=(?:UTF-8|utf-8)''([^;\s]+)/i);
  if (utf8Match) {
    try {
      const decoded = decodeURIComponent(utf8Match[1]);
      if (hasValidKorean(decoded) || /^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
    } catch {
      // Fall through to other methods
    }
  }

  // 2. Try filename="name" or filename=name
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=["']?([^"';\n]+)["']?/i);
  if (!filenameMatch) return null;

  let fileName = filenameMatch[1].trim();

  // Remove surrounding quotes if present
  if ((fileName.startsWith('"') && fileName.endsWith('"')) ||
      (fileName.startsWith("'") && fileName.endsWith("'"))) {
    fileName = fileName.slice(1, -1);
  }

  // 3. Try URL decoding first
  try {
    const urlDecoded = decodeURIComponent(fileName);
    if (urlDecoded !== fileName && hasValidKorean(urlDecoded)) {
      return urlDecoded;
    }
  } catch {
    // Not URL encoded
  }

  // 4. Check if it's already valid Korean
  if (hasValidKorean(fileName) && !isCorruptedFileName(fileName)) {
    return fileName;
  }

  // 5. Check if all characters are in Latin-1 range (0-255)
  let isLatin1Range = true;
  for (let i = 0; i < fileName.length; i++) {
    if (fileName.charCodeAt(i) > 255) {
      isLatin1Range = false;
      break;
    }
  }

  if (isLatin1Range) {
    // Convert string to byte array (Latin-1 code points = original bytes)
    const bytes = Buffer.from(fileName, 'latin1');

    // 5a. Try UTF-8 decoding first (most common for modern servers)
    try {
      const utf8Decoded = bytes.toString('utf-8');
      if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
        return utf8Decoded;
      }
    } catch {
      // UTF-8 decoding failed
    }

    // 5b. Try EUC-KR decoding (common in older Korean government sites)
    try {
      const eucKrDecoded = iconv.decode(bytes, 'euc-kr');
      if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
        return eucKrDecoded;
      }
    } catch {
      // EUC-KR decoding failed
    }

    // 5c. Try CP949 (Microsoft extended EUC-KR)
    try {
      const cp949Decoded = iconv.decode(bytes, 'cp949');
      if (hasValidKorean(cp949Decoded) && !isCorruptedFileName(cp949Decoded)) {
        return cp949Decoded;
      }
    } catch {
      // CP949 decoding failed
    }
  }

  // 6. If filename appears corrupted, try to repair it
  if (isCorruptedFileName(fileName)) {
    const repaired = await repairCorruptedFileName(fileName);
    if (repaired !== fileName && hasValidKorean(repaired)) {
      return repaired;
    }
  }

  // 7. Return original if no decoding worked
  return fileName;
}

/**
 * Export repair function for use in admin scripts
 */
export { repairCorruptedFileName, isCorruptedFileName, hasValidKorean };

/**
 * URL 정리 유틸리티
 * 다운로드 실패의 주요 원인인 세션 ID 및 특수 URL 패턴 처리
 */

/**
 * jsessionid 제거
 * 예: /getFile.do;jsessionid=abc123?param=value → /getFile.do?param=value
 */
function removeJsessionId(url: string): string {
  // URL path에 포함된 ;jsessionid=xxx 패턴 제거
  return url.replace(/;jsessionid=[^?&]*/gi, '');
}

/**
 * PDF 뷰어 URL에서 실제 파일 URL 추출
 * 예: /viewer.html?file=/path/to/file.pdf → /path/to/file.pdf
 */
function extractPdfFromViewerUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // PDF 뷰어 패턴 감지: viewer.html, pdfviewer, viewer 등
    if (urlObj.pathname.includes('viewer')) {
      const fileParam = urlObj.searchParams.get('file');
      if (fileParam) {
        // file 파라미터가 절대 경로인 경우
        if (fileParam.startsWith('/')) {
          return `${urlObj.protocol}//${urlObj.host}${fileParam.split('#')[0]}`;
        }
        // file 파라미터가 완전한 URL인 경우
        if (fileParam.startsWith('http')) {
          return fileParam.split('#')[0];
        }
      }
    }
  } catch {
    // URL 파싱 실패
  }
  return null;
}

/**
 * 다운로드 URL 정규화
 * 1. jsessionid 제거
 * 2. PDF 뷰어 URL 변환
 */
function normalizeDownloadUrl(url: string): string {
  // 1. PDF 뷰어 URL 처리
  const pdfUrl = extractPdfFromViewerUrl(url);
  if (pdfUrl) {
    logger.debug(`PDF viewer URL detected, extracted: ${pdfUrl}`);
    return pdfUrl;
  }

  // 2. jsessionid 제거
  const cleanedUrl = removeJsessionId(url);
  if (cleanedUrl !== url) {
    logger.debug(`Removed jsessionid from URL`);
  }

  return cleanedUrl;
}

/**
 * Step 3: Download file from URL
 * Returns buffer and actual filename from Content-Disposition header
 * Enhanced with retry logic and HTTP agents for Vercel compatibility
 */
async function downloadFile(url: string, cookies?: string): Promise<DownloadResult | null> {
  try {
    const axios = (await import("axios")).default;

    // URL 정규화 (jsessionid 제거, PDF 뷰어 URL 변환)
    const normalizedUrl = normalizeDownloadUrl(url);

    // Extract referer from URL
    const urlObj = new URL(normalizedUrl);
    const referer = `${urlObj.protocol}//${urlObj.host}/`;

    logger.debug(`Downloading file from ${urlObj.host}...`);

    const response = await fetchWithRetry(
      () => axios.get(normalizedUrl, {
        responseType: 'arraybuffer',
        timeout: CRAWLER_CONFIG.FILE_TIMEOUT,
        maxContentLength: 50 * 1024 * 1024, // 50MB limit
        httpAgent,
        httpsAgent,
        headers: getCrawlerHeaders('file', referer, cookies),
        // 리다이렉트 따라가기
        maxRedirects: 5,
      }),
      { retries: 3, initialDelayMs: 2000, maxDelayMs: 10000 } // 재시도 3회로 증가
    );

    // Content-Type 검증 (HTML 응답 조기 감지)
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      logger.warn(`Server returned HTML instead of file (Content-Type: ${contentType})`);
      return null;
    }

    const buffer = Buffer.from(response.data);
    const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);

    // Extract actual filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const fileName = await extractFileNameFromHeader(contentDisposition);

    if (fileName) {
      logger.debug(`Downloaded ${sizeInMB}MB - "${fileName}"`);
    } else {
      logger.debug(`Downloaded ${sizeInMB}MB`);
    }

    // 바이너리 검증: HTML 응답 이중 체크 (일부 서버는 Content-Type 미설정)
    const preview = buffer.slice(0, 100).toString('utf8', 0, 100);
    if (preview.includes('<!DOCTYPE') || preview.includes('<html') || preview.includes('<HTML')) {
      logger.warn("Downloaded HTML instead of file (binary check)");
      return null;
    }

    return { buffer, fileName };
  } catch (error: any) {
    logger.error("Download failed", { error: error.message });
    return null;
  }
}

/**
 * Detect file type from buffer using magic bytes
 */
function detectFileType(buffer: Buffer): 'pdf' | 'hwp' | 'hwpx' | 'unknown' {
  // Check PDF signature: %PDF-
  if (buffer.length >= 5 && buffer.slice(0, 5).toString() === '%PDF-') {
    return 'pdf';
  }

  // Check HWP signature: OLE Compound File (HWP 5.0)
  if (buffer.length >= 8 &&
      buffer[0] === 0xD0 && buffer[1] === 0xCF &&
      buffer[2] === 0x11 && buffer[3] === 0xE0) {
    return 'hwp';
  }

  // Check HWPX signature: ZIP file (HWPX is ZIP-based)
  if (buffer.length >= 4 &&
      buffer[0] === 0x50 && buffer[1] === 0x4B &&
      buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'hwpx';
  }

  return 'unknown';
}

/**
 * Parse HWP file using local Node.js libraries
 */
async function parseHwpLocal(buffer: Buffer): Promise<string | null> {
  try {
    // Try hwp.js (named export)
    const { parse } = await import("hwp.js");

    // Convert Buffer to Uint8Array (hwp.js requires this)
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const doc = parse(uint8Array);

    // Extract text from all sections
    const textParts: string[] = [];
    if (doc.sections) {
      for (const section of doc.sections) {
        if (section.content) {
          // Try to extract text from paragraphs
          const sectionText = extractTextFromSection(section);
          if (sectionText) textParts.push(sectionText);
        }
      }
    }

    const fullText = textParts.join('\n\n');
    if (fullText.length > 0) {
      logger.debug(`Local HWP parser extracted ${fullText.length} characters`);
      return fullText;
    }
  } catch (error: any) {
    logger.warn(`hwp.js failed: ${error.message}`);
  }

  return null;
}

/**
 * Extract text from HWP section
 */
function extractTextFromSection(section: any): string {
  const texts: string[] = [];

  try {
    // Try to get paragraph content
    if (section.content && Array.isArray(section.content)) {
      for (const para of section.content) {
        if (para.content && Array.isArray(para.content)) {
          for (const item of para.content) {
            if (typeof item === 'string') {
              texts.push(item);
            } else if (item.value && typeof item.value === 'string') {
              texts.push(item.value);
            }
          }
        }
      }
    }
  } catch {
    // Silently ignore parsing errors
  }

  return texts.join(' ').trim();
}

/**
 * Parse HWPX file using JSZip
 */
async function parseHwpxLocal(buffer: Buffer): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);

    // HWPX structure: Contents/section0.xml, section1.xml, etc.
    const textParts: string[] = [];

    // Try to find and extract text from section files
    const sectionFiles = Object.keys(zip.files).filter(name =>
      name.startsWith('Contents/section') && name.endsWith('.xml')
    );

    for (const fileName of sectionFiles) {
      const content = await zip.files[fileName].async('text');
      // Extract text between <TEXT> tags (simplified)
      const textMatches = content.match(/<TEXT[^>]*>([\s\S]*?)<\/TEXT>/g);
      if (textMatches) {
        textMatches.forEach(match => {
          // Remove XML tags
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text) textParts.push(text);
        });
      }
    }

    const fullText = textParts.join('\n\n');

    if (fullText.length > 0) {
      logger.debug(`Local HWPX parser extracted ${fullText.length} characters`);
      return fullText;
    }
  } catch (error: any) {
    logger.warn(`HWPX local parser failed: ${error.message}`);
  }

  return null;
}

/**
 * Parse PDF file using pdf-parse
 * Local fallback when text_parser service fails
 */
async function parsePdfLocal(buffer: Buffer): Promise<string | null> {
  try {
    // pdf-parse v2 동적 임포트
    const { PDFParse } = await import("pdf-parse");

    // PDF 파싱 (v2 API: class-based)
    // data 옵션: Buffer를 Uint8Array로 변환
    const parser = new PDFParse({
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });

    // 텍스트 추출 (getText가 load를 포함)
    const result = await parser.getText();

    // 파서 정리
    await parser.destroy();

    // result.text에서 텍스트 추출
    const text = result?.text;

    if (text && text.length > 0) {
      // 텍스트 정리: 여러 줄 바꿈을 하나로
      const cleanText = text
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      logger.debug(`Local PDF parser extracted ${cleanText.length} characters`);
      return cleanText;
    }

    logger.warn("PDF parsed but no text extracted (might be image-based)");
    return null;
  } catch (error: any) {
    logger.warn(`PDF local parser failed: ${error.message}`);
    return null;
  }
}

/**
 * Step 3: Extract text from file buffer
 * Tries Railway parsers first, then falls back to local libraries
 * Supports PDF, HWP, and HWPX formats
 */
async function extractFileText(buffer: Buffer): Promise<string | null> {
  try {
    // Detect file type
    const fileType = detectFileType(buffer);

    if (fileType === 'unknown') {
      logger.warn("Unknown file format");
      return null;
    }

    logger.debug(`Detected file type: ${fileType.toUpperCase()}`);

    // Try text_parser service first
    logger.debug(`Trying text_parser ${fileType.toUpperCase()} parser...`);
    try {
      const { parseDocument } = await import("@/lib/document-parser");
      const result = await parseDocument(buffer, fileType, 'text');

      if (result.success && result.text.length > 0) {
        const textLength = result.text.length;
        logger.debug(`text_parser extracted ${textLength} characters`);

        // Limit text to first 10,000 characters for API efficiency
        const limitedText = result.text.substring(0, 10000);
        return limitedText;
      } else {
        logger.warn("text_parser returned no text, trying local fallback...");
      }
    } catch (parserError: any) {
      logger.warn(`text_parser failed: ${parserError.message}, falling back to local parsing...`);
    }

    // Fallback to local parsing
    let extractedText: string | null = null;

    if (fileType === 'hwp') {
      extractedText = await parseHwpLocal(buffer);
    } else if (fileType === 'hwpx') {
      extractedText = await parseHwpxLocal(buffer);
    } else if (fileType === 'pdf') {
      extractedText = await parsePdfLocal(buffer);
    }

    if (extractedText && extractedText.length > 0) {
      // Limit text to first 10,000 characters for API efficiency
      const limitedText = extractedText.substring(0, 10000);
      return limitedText;
    }

    logger.warn("All parsing methods failed");
    return null;

  } catch (error: any) {
    logger.error("File extraction failed", { error: error.message });
    return null;
  }
}

/**
 * Step 4: Analyze document with Gemini AI
 *
 * 지원금액 추출 전략:
 * 1. Gemini에게 amountMin, amountMax 숫자 추출 요청
 * 2. AI가 숫자로 반환하지 않으면 fundingSummary에서 폴백 파싱
 * 3. 최종적으로 amountDescription에서 폴백 파싱
 */
async function analyzeWithGemini(text: string): Promise<{
  summary?: string;
  description?: string;
  eligibility?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
  fundingSummary?: string;
  amountDescription?: string;
  amountMin?: number;
  amountMax?: number;
  deadline?: string;
  startDate?: string;
  endDate?: string;
} | null> {
  try {
    // Check if API key is available
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      logger.warn("Gemini API key not configured, skipping AI analysis");
      return null;
    }

    const { google } = await import("@ai-sdk/google");
    const { generateText } = await import("ai");

    logger.debug("Analyzing with Gemini AI...");

    const model = google("gemini-3-flash-preview");

    const prompt = `다음은 정부 지원사업 공고문입니다. 아래 정보를 JSON 형식으로 추출해주세요:

1. summary: 사업 요약 (1문장, 30~50자, 핵심 내용만. 예: "창업 3년 이내 기업 대상 최대 1억원 지원")
2. description: 사업의 목적과 개요 (2-3문장, 핵심만)
3. eligibility: 신청 자격 요건 (핵심만, 있는 경우)
4. applicationProcess: 신청 방법 및 절차 (간단히, 있는 경우)
5. evaluationCriteria: 평가 기준 (있는 경우)
6. fundingSummary: 지원 금액을 한 줄로 간결하게 요약 (예: "최대 400만원", "업체당 500만원 이내", "최대 1억원 (전액 무상)", "70% 보조금 지원"). 반드시 10~30자 이내로 핵심만 작성.
7. amountDescription: 지원 금액에 대한 상세 설명. 세부 항목별 금액, 지원 조건, 자부담 비율 등 상세 내용을 포함.
8. amountMin: 최소 지원 금액 (원화 숫자만, 예: 5000000). 범위가 있는 경우 최소값, 없으면 생략.
9. amountMax: 최대 지원 금액 (원화 숫자만, 예: 100000000). "최대 1억원"이면 100000000, "500만원"이면 5000000.
10. deadline: 신청 마감일 (YYYY-MM-DD 형식, 있는 경우)
11. startDate: 사업/접수 시작일 (YYYY-MM-DD 형식, 있는 경우)
12. endDate: 사업/접수 종료일 (YYYY-MM-DD 형식, 있는 경우)

중요: amountMin, amountMax는 반드시 숫자(number)로 반환하세요. 문자열이 아닌 순수 숫자입니다.
- "최대 4억원" → amountMax: 400000000
- "500만원 ~ 1억원" → amountMin: 5000000, amountMax: 100000000
- "업체당 3천만원 이내" → amountMax: 30000000
- "최소 1천만원" → amountMin: 10000000

응답은 반드시 다음 JSON 형식으로만 작성해주세요:
{
  "summary": "...",
  "description": "...",
  "eligibility": "...",
  "applicationProcess": "...",
  "evaluationCriteria": "...",
  "fundingSummary": "...",
  "amountDescription": "...",
  "amountMin": 5000000,
  "amountMax": 100000000,
  "deadline": "2025-12-31",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}

정보가 없는 항목은 생략하세요. 날짜는 반드시 YYYY-MM-DD 형식으로, 금액은 반드시 숫자로 작성하세요.

원문:
${text}`;

    const { text: result } = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistency
    });

    // Try to parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("Failed to extract JSON from response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logger.debug("AI analysis complete", {
      hasAmountMin: parsed.amountMin !== undefined,
      hasAmountMax: parsed.amountMax !== undefined,
      amountMin: parsed.amountMin,
      amountMax: parsed.amountMax,
    });

    // Fallback: If AI didn't return numeric amounts, try parsing from text fields
    if (parsed.amountMin === undefined && parsed.amountMax === undefined) {
      logger.debug("AI didn't extract numeric amounts, attempting fallback parsing...");

      // Try parsing from fundingSummary first
      let fallbackResult = extractAmountRange(parsed.fundingSummary);

      // If fundingSummary parsing failed, try amountDescription
      if (!fallbackResult.amountMin && !fallbackResult.amountMax && parsed.amountDescription) {
        fallbackResult = extractAmountRange(parsed.amountDescription);
      }

      if (fallbackResult.amountMin || fallbackResult.amountMax) {
        parsed.amountMin = fallbackResult.amountMin ?? undefined;
        parsed.amountMax = fallbackResult.amountMax ?? undefined;
        logger.debug("Fallback parsing successful", {
          amountMin: parsed.amountMin,
          amountMax: parsed.amountMax,
        });
      }
    }

    // Ensure amounts are numbers (in case AI returned strings)
    if (typeof parsed.amountMin === 'string') {
      parsed.amountMin = parseKoreanAmount(parsed.amountMin) ?? undefined;
    }
    if (typeof parsed.amountMax === 'string') {
      parsed.amountMax = parseKoreanAmount(parsed.amountMax) ?? undefined;
    }

    return parsed;
  } catch (error: any) {
    logger.error("Gemini analysis failed", { error: error.message });
    return null;
  }
}

/**
 * Extract filename from URL
 */
function extractFileName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];

    // If no valid filename, generate one with timestamp
    if (!fileName || fileName.length < 3) {
      return `file_${Date.now()}`;
    }

    // Decode URL encoded filename
    return decodeURIComponent(fileName);
  } catch {
    return `file_${Date.now()}`;
  }
}

/**
 * Step 3+4: Process files for a project (Selective Storage Strategy)
 *
 * 처리 흐름:
 * 1. 파싱 대상 판단 (공고, 신청서, 사업계획서만 Storage 저장)
 * 2. 파싱 대상: 다운로드 → Content-Disposition 파일명 추출 → Storage 저장 → 텍스트 추출
 * 3. 비파싱 대상: URL만 기록 (storagePath = null, fileSize = 0)
 * 4. 첫 번째 파싱된 파일로 AI 분석
 *
 * @param projectId 프로젝트 ID (DB에 저장된 후)
 * @param attachmentUrls 첨부파일 URL 목록
 * @returns 저장된 첨부파일 정보 + AI 분석 결과
 */
async function processProjectFiles(
  projectId: string,
  attachmentUrls: string[],
  cookies?: string
): Promise<{
  attachments: SavedAttachment[];
  aiAnalysis?: {
    summary?: string;
    description?: string;
    eligibility?: string;
    applicationProcess?: string;
    evaluationCriteria?: string;
    fundingSummary?: string;
    amountDescription?: string;
    amountMin?: number;
    amountMax?: number;
    deadline?: string;
    startDate?: string;
    endDate?: string;
  };
}> {
  const attachments: SavedAttachment[] = [];
  let aiAnalysis: {
    summary?: string;
    description?: string;
    eligibility?: string;
    applicationProcess?: string;
    evaluationCriteria?: string;
    fundingSummary?: string;
    amountDescription?: string;
    amountMin?: number;
    amountMax?: number;
    deadline?: string;
    startDate?: string;
    endDate?: string;
  } | undefined;

  // 파일별 정보 준비
  const fileInfos = attachmentUrls.map(url => ({
    url,
    fileName: extractFileName(url), // URL에서 추출한 예상 파일명
    fileType: getFileTypeFromName(extractFileName(url)),
  }));

  // 파싱 우선순위로 정렬 (공고 > 신청서 > 일반)
  const sortedFiles = sortByParsingPriority(fileInfos);

  logger.debug(`Processing ${sortedFiles.length} file(s)`);
  let firstParsedText: string | null = null;

  for (let i = 0; i < sortedFiles.length; i++) {
    const { url, fileName: urlFileName, fileType } = sortedFiles[i];

    // URL에서 파일 타입을 알 수 없는 경우 (예: getImageFile.do) 일단 다운로드 필요
    const needsDownloadToCheck = fileType === 'unknown' || urlFileName.includes('getImageFile');
    const preliminaryShouldParse = shouldParseFile(urlFileName);

    logger.debug(`[${i + 1}/${sortedFiles.length}] ${urlFileName}`);

    // URL에서 타입을 알 수 없으면 일단 다운로드해서 확인
    if (needsDownloadToCheck) {
      logger.debug("Type unknown, downloading to check...");

      const downloadResult = await downloadFile(url, cookies);
      if (!downloadResult) {
        logger.warn("Download failed, recording URL only");
        attachments.push({
          fileName: urlFileName,
          fileType: 'unknown' as FileType,
          fileSize: 0,
          storagePath: '',
          sourceUrl: url,
          shouldParse: false,
          isParsed: false,
          parseError: 'Download failed',
        });
        continue;
      }

      const { buffer: fileBuffer, fileName: actualFileName } = downloadResult;
      const finalFileName = actualFileName || urlFileName;
      const detectedType = detectFileType(fileBuffer);

      // 실제 파일명으로 파싱 대상 재판단
      const actualShouldParse = shouldParseFile(finalFileName);

      logger.debug(`Actual filename: "${finalFileName}", type: ${detectedType}, storage: ${actualShouldParse ? 'YES' : 'NO'}`);

      if (!actualShouldParse) {
        // 핵심 문서가 아님 - URL만 저장
        attachments.push({
          fileName: finalFileName,
          fileType: detectedType as FileType,
          fileSize: fileBuffer.length,
          storagePath: '',
          sourceUrl: url,
          shouldParse: false,
          isParsed: false,
        });
        logger.debug("URL recorded (not a key document)");
        continue;
      }

      // 핵심 문서임 - Storage에 저장하고 파싱
      const uploadResult = await uploadFile(
        fileBuffer,
        projectId,
        finalFileName,
        detectedType as FileType
      );

      if (!uploadResult.success || !uploadResult.storagePath) {
        logger.error(`Upload failed: ${uploadResult.error}`);
        attachments.push({
          fileName: finalFileName,
          fileType: detectedType as FileType,
          fileSize: fileBuffer.length,
          storagePath: '',
          sourceUrl: url,
          shouldParse: true,
          isParsed: false,
          parseError: `Upload failed: ${uploadResult.error}`,
        });
        continue;
      }

      logger.debug(`Stored: ${uploadResult.storagePath}`);

      // 텍스트 추출
      let parsedContent: string | undefined;
      let parseError: string | undefined;
      let isParsed = false;

      try {
        const text = await extractFileText(fileBuffer);
        if (text && text.length > 0) {
          parsedContent = text;
          isParsed = true;
          logger.debug(`Parsed ${text.length} characters`);
          if (!firstParsedText) firstParsedText = text;
        } else {
          parseError = 'No text extracted';
          logger.warn("No text extracted");
        }
      } catch (error) {
        parseError = error instanceof Error ? error.message : 'Unknown parsing error';
        logger.error(`Parse error: ${parseError}`);
      }

      attachments.push({
        fileName: finalFileName,
        fileType: detectedType as FileType,
        fileSize: fileBuffer.length,
        storagePath: uploadResult.storagePath,
        sourceUrl: url,
        shouldParse: true,
        isParsed,
        parsedContent,
        parseError,
      });
      continue;
    }

    // URL에서 파일 타입을 알 수 있는 경우 - 기존 로직
    logger.debug(`Type: ${fileType}, Storage: ${preliminaryShouldParse ? 'YES' : 'NO'}`);

    // ===== 비파싱 대상: URL만 저장 (Storage에 저장하지 않음) =====
    if (!preliminaryShouldParse) {
      attachments.push({
        fileName: urlFileName,
        fileType: fileType as FileType,
        fileSize: 0, // 다운로드하지 않으므로 크기 미확인
        storagePath: '', // null 대신 빈 문자열 (DB에서 null로 저장됨)
        sourceUrl: url,
        shouldParse: false,
        isParsed: false,
      });
      logger.debug("URL recorded (no download)");
      continue;
    }

    // ===== 파싱 대상: 다운로드 → Storage 저장 → 텍스트 추출 =====

    // Step 1: 파일 다운로드 + Content-Disposition 파일명 추출
    const downloadResult = await downloadFile(url, cookies);
    if (!downloadResult) {
      logger.warn("Download failed, recording URL only");
      // 다운로드 실패해도 URL은 기록
      attachments.push({
        fileName: urlFileName,
        fileType: fileType as FileType,
        fileSize: 0,
        storagePath: '',
        sourceUrl: url,
        shouldParse: true,
        isParsed: false,
        parseError: 'Download failed',
      });
      continue;
    }

    const { buffer: fileBuffer, fileName: actualFileName } = downloadResult;
    // 실제 파일명: Content-Disposition에서 추출한 것 우선, 없으면 URL에서 추출
    const finalFileName = actualFileName || urlFileName;

    // Step 2: 파일 타입 검증 (magic bytes)
    const detectedType = detectFileType(fileBuffer);
    const finalFileType = detectedType !== 'unknown' ? detectedType : fileType;

    // Step 3: Supabase Storage에 저장 (핵심 문서만)
    const uploadResult = await uploadFile(
      fileBuffer,
      projectId,
      finalFileName,
      finalFileType as FileType
    );

    if (!uploadResult.success || !uploadResult.storagePath) {
      logger.error(`Upload failed: ${uploadResult.error}`);
      // 업로드 실패해도 URL은 기록
      attachments.push({
        fileName: finalFileName,
        fileType: finalFileType as FileType,
        fileSize: fileBuffer.length,
        storagePath: '',
        sourceUrl: url,
        shouldParse: true,
        isParsed: false,
        parseError: `Upload failed: ${uploadResult.error}`,
      });
      continue;
    }

    logger.debug(`Stored: ${uploadResult.storagePath}, filename: "${finalFileName}"`);

    // Step 4: 텍스트 추출
    let parsedContent: string | undefined;
    let parseError: string | undefined;
    let isParsed = false;

    try {
      const text = await extractFileText(fileBuffer);
      if (text && text.length > 0) {
        parsedContent = text;
        isParsed = true;
        logger.debug(`Parsed ${text.length} characters`);

        // 첫 번째 파싱된 텍스트를 AI 분석에 사용
        if (!firstParsedText) {
          firstParsedText = text;
        }
      } else {
        parseError = 'No text extracted';
        logger.warn("No text extracted");
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Unknown parsing error';
      logger.error(`Parse error: ${parseError}`);
    }

    // 첨부파일 정보 저장 (Storage에 저장됨)
    attachments.push({
      fileName: finalFileName,
      fileType: finalFileType as FileType,
      fileSize: fileBuffer.length,
      storagePath: uploadResult.storagePath,
      sourceUrl: url,
      shouldParse: true,
      isParsed,
      parsedContent,
      parseError,
    });
  }

  // Step 5: 첫 번째 파싱된 파일로 AI 분석
  if (firstParsedText) {
    logger.debug("Running AI analysis on parsed content...");
    aiAnalysis = await analyzeWithGemini(firstParsedText) || undefined;
  }

  return { attachments, aiAnalysis };
}

/**
 * Crawler configuration
 * Railway 워커 환경 (타임아웃 제한 없음)
 *
 * 시간 기반 필터링: 14일(336시간) 이내 등록된 공고만 수집
 * 페이지 제한 없음: 시간 필터에 의해 자연스럽게 종료
 *
 * NOTE: 7일 필터도 일부 사이트에서 공고를 놓치는 경우가 있어
 * 14일로 변경하여 더 많은 공고를 수집함.
 */
const CRAWLER_CONFIG = {
  // 페이지네이션 설정 (Railway: 무제한)
  MAX_PAGES: 50,           // 충분히 높게 설정 (시간 필터로 자연 종료)
  PAGE_SIZE: 15,           // 기업마당 기본 페이지 크기
  // MAX_PROJECTS 제거: 시간 필터만으로 제어

  // 시간 필터 설정
  HOURS_FILTER: 720,       // 30일(720시간) 이내 등록된 공고 수집 (기존: 14일=336시간)

  // 요청 간격 (rate limiting - 증가시켜 안정성 향상)
  PAGE_DELAY_MS: 1000,     // 500 → 1000 (서버 부하 감소)
  DETAIL_DELAY_MS: 1500,   // 500 → 1500 (연결 안정성)
  FILE_DELAY_MS: 2000,     // 파일 처리 간 딜레이

  // 타임아웃 설정 (Railway 환경 - 한국 사이트 접속 시간 고려)
  REQUEST_TIMEOUT: 60000,  // 60초 (US→Korea 네트워크 지연 대응)
  FILE_TIMEOUT: 90000,     // 파일 다운로드는 90초
};

/**
 * Check if upload date is within time filter
 * 지원 형식:
 * - "2025-12-05" (YYYY-MM-DD) - 기업마당
 * - "2025.12.05" (YYYY.MM.DD) - 대전테크노파크 등
 * - "25-12-05" (YY-MM-DD)
 * - "25.12.05" (YY.MM.DD)
 */
function isWithinTimeFilter(dateStr: string, hoursFilter: number): boolean {
  try {
    if (!dateStr || dateStr.trim() === '') {
      return true; // 날짜 없으면 포함
    }

    // 날짜 문자열 정규화
    let normalizedDate = dateStr.trim();

    // YYYY.MM.DD → YYYY-MM-DD 변환
    normalizedDate = normalizedDate.replace(/(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');

    // YY.MM.DD → 20YY-MM-DD 변환
    normalizedDate = normalizedDate.replace(/^(\d{2})\.(\d{2})\.(\d{2})$/, '20$1-$2-$3');

    // YY-MM-DD → 20YY-MM-DD 변환
    normalizedDate = normalizedDate.replace(/^(\d{2})-(\d{2})-(\d{2})$/, '20$1-$2-$3');

    // 날짜만 추출 (시간 부분 제거)
    const dateMatch = normalizedDate.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) {
      logger.debug(`Date pattern not found in: ${dateStr}, including anyway`);
      return true;
    }

    const uploadDate = new Date(dateMatch[0]);
    if (isNaN(uploadDate.getTime())) {
      logger.warn(`Invalid date format: ${dateStr}, including anyway`);
      return true; // 파싱 실패시 포함
    }

    // 현재 시간과 비교
    const now = new Date();
    const diffHours = (now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60);

    return diffHours <= hoursFilter;
  } catch {
    return true; // 오류 시 포함
  }
}

/**
 * Extract region from organization name
 * 예: "부산광역시" → "부산", "경상남도" → "경남"
 */
function extractRegionFromOrganization(org: string): string | null {
  const regionMap: Record<string, string> = {
    '서울': '서울', '서울특별시': '서울', '서울시': '서울',
    '부산': '부산', '부산광역시': '부산', '부산시': '부산',
    '대구': '대구', '대구광역시': '대구', '대구시': '대구',
    '인천': '인천', '인천광역시': '인천', '인천시': '인천',
    '광주': '광주', '광주광역시': '광주', '광주시': '광주',
    '대전': '대전', '대전광역시': '대전', '대전시': '대전',
    '울산': '울산', '울산광역시': '울산', '울산시': '울산',
    '세종': '세종', '세종특별자치시': '세종', '세종시': '세종',
    '경기': '경기', '경기도': '경기',
    '강원': '강원', '강원도': '강원', '강원특별자치도': '강원',
    '충북': '충북', '충청북도': '충북',
    '충남': '충남', '충청남도': '충남',
    '전북': '전북', '전라북도': '전북', '전북특별자치도': '전북',
    '전남': '전남', '전라남도': '전남',
    '경북': '경북', '경상북도': '경북',
    '경남': '경남', '경상남도': '경남',
    '제주': '제주', '제주특별자치도': '제주', '제주도': '제주',
  };

  for (const [key, value] of Object.entries(regionMap)) {
    if (org.includes(key)) {
      return value;
    }
  }
  return null;
}

/**
 * Build paginated URL for 기업마당
 * 기업마당 URL 패턴: ?rows=15&cpage=N
 * NOTE: 기업마당은 cpage 파라미터를 사용 (pageIndex 아님)
 */
function buildBizinfoPaginatedUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);

  // 기존 페이지 파라미터 제거
  url.searchParams.delete('pageIndex');
  url.searchParams.delete('cpage');
  url.searchParams.delete('page');
  url.searchParams.delete('rows');

  // 새 페이지 파라미터 추가 (기업마당은 cpage 사용)
  url.searchParams.set('rows', '15');
  url.searchParams.set('cpage', pageIndex.toString());

  return url.toString();
}

/**
 * Actual crawling implementation
 * Supports both 'web' (HTML scraping) and 'api' (JSON response) types
 *
 * Enhanced: 페이지네이션 지원 + 28시간 이내 필터링
 */
async function crawlAndParse(
  url: string,
  type: string
): Promise<CrawledProject[]> {
  const axios = (await import("axios")).default;
  const { load } = await import("cheerio");

  try {
    let allProjects: CrawledProject[] = [];

    if (type === "api") {
      // API response parsing (JSON) - 단일 요청
      const response = await fetchWithRetry(
        () => axios.get(url, {
          timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
          httpAgent,
          httpsAgent,
          headers: getCrawlerHeaders('json'),
        }),
        { retries: 2 }
      );
      allProjects = parseApiResponse(response.data, url);
    } else {
      // Web scraping (HTML) - 페이지네이션 지원
      const siteType = detectSiteType(url);
      logger.info(`Step 1: Crawling ${siteType} with pagination (max ${CRAWLER_CONFIG.MAX_PAGES} pages)`);

      let pageIndex = 1;
      let consecutiveEmptyPages = 0;

      while (pageIndex <= CRAWLER_CONFIG.MAX_PAGES) {
        // 사이트별 페이지네이션 URL 생성
        let pageUrl: string;
        if (siteType === 'kstartup') {
          pageUrl = buildKStartupPaginatedUrl(url, pageIndex);
        } else if (siteType === 'bizinfo') {
          pageUrl = buildBizinfoPaginatedUrl(url, pageIndex);
        } else if (siteType === 'technopark') {
          // 테크노파크는 페이지네이션 없음 - 첫 페이지만 크롤링
          pageUrl = url;
          if (pageIndex > 1) {
            logger.info('Technopark: No pagination, stopping after first page');
            break;
          }
        } else {
          pageUrl = url; // 알 수 없는 사이트는 원본 URL 사용
        }
        logger.info(`[${siteType}][Page ${pageIndex}] Fetching: ${pageUrl}`);

        try {
          let htmlContent: string;

          // WAF 차단 도메인은 Playwright 사용
          if (isWafBlockedDomain(pageUrl)) {
            logger.info(`[Playwright] Using browser for WAF-blocked domain: ${pageUrl}`);
            const { html } = await fetchWithPlaywright(pageUrl, {
              timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
              waitForSelector: "table",
            });
            htmlContent = html;
          } else {
            // 일반 도메인은 axios 사용, 실패 시 Playwright fallback
            try {
              const response = await fetchWithRetry(
                () => axios.get(pageUrl, {
                  timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
                  httpAgent,
                  httpsAgent,
                  headers: getCrawlerHeaders(),
                }),
                { retries: 2, initialDelayMs: 1000 }
              );
              htmlContent = response.data;
            } catch (axiosError: any) {
              // ERR_BAD_REQUEST 또는 403/503 에러 시 Playwright fallback
              const errorCode = axiosError.code || "";
              const statusCode = axiosError.response?.status;
              if (errorCode === "ERR_BAD_REQUEST" || statusCode === 403 || statusCode === 503) {
                logger.info(`[Playwright] Fallback for ${pageUrl} (${errorCode || statusCode})`);
                const { html } = await fetchWithPlaywright(pageUrl, {
                  timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
                  waitForSelector: "table",
                });
                htmlContent = html;
              } else {
                throw axiosError;
              }
            }
          }

          const $ = load(htmlContent);
          const pageProjects = parseHtmlContentWithDateFilter($, url, CRAWLER_CONFIG.HOURS_FILTER);

          logger.debug(`Found ${pageProjects.length} projects (within ${CRAWLER_CONFIG.HOURS_FILTER}h filter)`);

          if (pageProjects.length === 0) {
            consecutiveEmptyPages++;
            logger.debug(`Empty page (${consecutiveEmptyPages} consecutive)`);

            // 2페이지 연속 빈 페이지면 중단 (시간 필터로 인한 자연스러운 종료)
            if (consecutiveEmptyPages >= 2) {
              logger.info("Stopping: No more recent projects");
              break;
            }
          } else {
            consecutiveEmptyPages = 0;
            allProjects.push(...pageProjects);
          }

          pageIndex++;

          // Rate limiting (increased for stability)
          if (pageIndex <= CRAWLER_CONFIG.MAX_PAGES) {
            await sleep(CRAWLER_CONFIG.PAGE_DELAY_MS);
          }
        } catch (pageError: any) {
          logger.error(`Error fetching page ${pageIndex}`, { errorCode: pageError.code || pageError.message });
          // Continue with collected projects instead of breaking
          logger.info(`Continuing with ${allProjects.length} projects collected so far`);
          break;
        }
      }

      logger.info(`Pagination complete: ${allProjects.length} projects collected`);
    }

    const projects = allProjects;

    // Step 2: Fetch detail pages and extract file URLs
    logger.info(`Step 2: Fetching detail pages for ${projects.length} projects`);

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];

      if (project.detailUrl) {
        logger.debug(`[${i + 1}/${projects.length}] ${project.name}`);

        try {
          const { fileUrls: attachmentUrls, cookies, detailInfo } = await fetchDetailPage(project.detailUrl, url);
          projects[i].attachmentUrls = attachmentUrls;
          projects[i].cookies = cookies;

          // Apply detail page info as fallback (file AI 분석보다 우선순위 낮음)
          // 이 정보는 saveProjects에서 AI 분석 결과가 없을 때 사용됨
          if (detailInfo) {
            // 금액 정보 적용 (amountMax가 없는 경우에만)
            if (!projects[i].amountMax && detailInfo.amountMax) {
              projects[i].amountMax = BigInt(Math.round(detailInfo.amountMax));
              if (detailInfo.amountMin) {
                projects[i].amountMin = BigInt(Math.round(detailInfo.amountMin));
              }
              logger.debug(`Applied HTML amount: ${detailInfo.amountMax}`);
            }
            // 금액 설명 적용
            if (!projects[i].amountDescription && detailInfo.amountDescription) {
              projects[i].amountDescription = detailInfo.amountDescription;
            }
            // 설명 적용
            if (!projects[i].description && detailInfo.description) {
              projects[i].description = detailInfo.description;
            }
            // 자격요건 적용
            if (!projects[i].eligibility && detailInfo.eligibility) {
              projects[i].eligibility = detailInfo.eligibility;
            }
            // 지원대상 적용
            if (!projects[i].target && detailInfo.target) {
              projects[i].target = detailInfo.target;
            }
            // 신청절차 적용
            if (!projects[i].applicationProcess && detailInfo.applicationProcess) {
              projects[i].applicationProcess = detailInfo.applicationProcess;
            }
            // 평가기준 적용
            if (!projects[i].evaluationCriteria && detailInfo.evaluationCriteria) {
              projects[i].evaluationCriteria = detailInfo.evaluationCriteria;
            }
            // 문의처 적용
            if (!projects[i].contactInfo && detailInfo.contactInfo) {
              projects[i].contactInfo = detailInfo.contactInfo;
            }
            // 마감일 적용
            if (!projects[i].deadline && detailInfo.deadline) {
              projects[i].deadline = detailInfo.deadline;
            }
            // 시작일 적용
            if (!projects[i].startDate && detailInfo.startDate) {
              projects[i].startDate = detailInfo.startDate;
            }
            // 요약 적용 (summary가 기본값인 경우에만)
            if (projects[i].summary === '정보 확인 필요' && detailInfo.summary) {
              projects[i].summary = detailInfo.summary;
            }
          }

          if (attachmentUrls.length > 0) {
            const fileNames = attachmentUrls.map(fileUrl => fileUrl.split('/').pop() || fileUrl);
            logger.debug(`Files found: ${fileNames.join(', ')}`);
          }
        } catch (error: any) {
          logger.error("Error fetching detail page", { errorCode: error.code || error.message });
        }

        // Add delay to avoid rate limiting (increased for stability)
        await sleep(CRAWLER_CONFIG.DETAIL_DELAY_MS);
      } else {
        logger.debug(`[${i + 1}/${projects.length}] ${project.name} - No detail URL found`);
      }
    }

    const projectsWithFiles = projects.filter(p => p.attachmentUrls && p.attachmentUrls.length > 0);
    logger.info("Detail page crawling complete", { projectsWithFiles: projectsWithFiles.length, totalProjects: projects.length });

    // NOTE: File processing (Step 3+4) now happens in saveProjects()
    // This allows us to:
    // 1. Save project first to get projectId
    // 2. Upload files to Supabase Storage with proper path
    // 3. Save attachment records linked to project
    // 4. Apply smart parsing only to relevant files

    logger.info(`Returning ${projects.length} projects for processing`);
    return projects;
  } catch (error) {
    logger.error(`Crawling failed for ${url}`, { error });
    throw new Error(
      `Failed to crawl ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Parse K-Startup HTML content
 * K-Startup 사업공고 페이지 파서 (k-startup.go.kr)
 *
 * HTML 구조:
 * - Container: <div class="board_list-wrap" id="bizPbancList">
 * - Items: <li class="notice">
 * - Title: <p class="tit">제목</p> inside <a href='javascript:go_view(ID);'>
 * - Category: <span class="flag type05">행사ㆍ네트워크</span>
 * - Dates: <span class="list">등록일자 YYYY-MM-DD</span>
 */
function parseKStartupHtml(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number,
  pbancClssCd: string
): CrawledProject[] {
  const projects: CrawledProject[] = [];

  // K-Startup 리스트 아이템 선택
  const listItems = $('#bizPbancList ul li.notice');
  logger.debug(`K-Startup parser: Found ${listItems.length} items`);

  listItems.each((_idx, element) => {
    const $item = $(element);

    // 제목 추출
    const $titleLink = $item.find('a[href*="go_view"]');
    const $title = $item.find('p.tit');
    const name = $title.text().trim();

    // pbancSn 추출 (go_view(ID) 패턴에서)
    let pbancSn = "";
    const hrefAttr = $titleLink.attr('href') || '';
    const idMatch = hrefAttr.match(/go_view\((\d+)\)/);
    if (idMatch) {
      pbancSn = idMatch[1];
    }

    // 카테고리 추출
    const category = $item.find('.flag').not('.day').not('.flag_agency').first().text().trim() || "기타";

    // 기관유형 추출 (민간, 공공 등)
    const agencyType = $item.find('.flag_agency').text().trim() || "";

    // 날짜 정보 추출
    let uploadDate = "";
    let deadline = "";
    let startDate = "";

    $item.find('.list').each((_i, infoElem) => {
      const infoText = $(infoElem).text().trim();

      // 등록일자
      if (infoText.includes('등록일자')) {
        const dateMatch = infoText.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) uploadDate = dateMatch[1];
      }
      // 마감일자
      if (infoText.includes('마감일자')) {
        const dateMatch = infoText.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) deadline = dateMatch[1];
      }
      // 시작일자
      if (infoText.includes('시작일자')) {
        const dateMatch = infoText.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) startDate = dateMatch[1];
      }
    });

    // 기관명 추출 (보통 두 번째 .list 항목)
    let organization = "";
    const listItems = $item.find('.list');
    if (listItems.length >= 2) {
      const orgText = $(listItems[1]).text().trim();
      // "주관기관명" 형식에서 기관명만 추출
      organization = orgText.replace(/^.*?pr5"><\/i>/, '').trim();
    }

    // 등록일 기반 필터링 - 날짜가 없거나 필터 밖이면 스킵
    // NOTE: 이전 버그 - uploadDate가 빈 문자열이면 필터 체크가 스킵되어
    // 모든 항목이 포함됨 (1000개 발견 원인)
    if (!uploadDate || !isWithinTimeFilter(uploadDate, hoursFilter)) {
      return;
    }

    // 유효성 검사
    if (!name || name.length < 3) {
      return;
    }

    // 상세 페이지 URL 구성
    // 패턴: ?schM=view&pbancSn={ID}&pbancClssCd={CODE}&pbancEndYn=N
    let detailUrl = "";
    if (pbancSn) {
      const baseUrl = new URL(sourceUrl);
      baseUrl.searchParams.set('schM', 'view');
      baseUrl.searchParams.set('pbancSn', pbancSn);
      baseUrl.searchParams.set('pbancClssCd', pbancClssCd);
      baseUrl.searchParams.set('pbancEndYn', 'N');
      detailUrl = baseUrl.toString();
    }

    const rawProject: CrawledProject = {
      externalId: pbancSn ? `kstartup_${pbancSn}` : undefined,
      name,
      organization: organization || agencyType || "K-Startup",
      category,
      target: "창업기업",
      region: "전국",
      summary: name,
      sourceUrl,
      detailUrl: detailUrl || undefined,
      deadline: deadline ? new Date(deadline) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      isPermanent: false,
    };

    // Validate and normalize category/region
    const validatedProject = validateProject(rawProject);
    projects.push(validatedProject);
  });

  return projects;
}

/**
 * Detect site type from URL
 * 개별 테크노파크 도메인도 인식 (예: btp.or.kr, gtp.or.kr, seoultp.or.kr 등)
 */
function detectSiteType(url: string): 'bizinfo' | 'kstartup' | 'technopark' | 'unknown' {
  if (url.includes('bizinfo.go.kr')) return 'bizinfo';
  if (url.includes('k-startup.go.kr')) return 'kstartup';
  if (url.includes('technopark.kr')) return 'technopark';

  // 개별 테크노파크 도메인 인식 (tp.or.kr 패턴)
  // 예: btp.or.kr, gtp.or.kr, seoultp.or.kr, itp.or.kr, gwtp.or.kr 등
  const tpDomainPattern = /(?:^|[./])([a-z]+tp[i]?\.or\.kr)/i;
  if (tpDomainPattern.test(url)) return 'technopark';

  return 'unknown';
}

/**
 * Extract pbancClssCd from K-Startup URL
 * PBC010: 중앙부처·지자체·공공기관
 * PBC020: 민간기관·교육기관
 */
function extractKStartupPbancClssCd(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('pbancClssCd') || 'PBC010';
  } catch {
    return 'PBC010';
  }
}

/**
 * Build paginated URL for K-Startup
 * K-Startup URL 패턴: ?page=N&pbancClssCd=PBC010
 */
function buildKStartupPaginatedUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set('page', pageIndex.toString());
  return url.toString();
}

/**
 * Parse HTML content with date filtering (기업마당, K-Startup, 테크노파크 등)
 * Enhanced: 28시간 이내 등록된 공고만 필터링
 * Auto-detects site type and uses appropriate parser
 */
function parseHtmlContentWithDateFilter(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number
): CrawledProject[] {
  const siteType = detectSiteType(sourceUrl);

  // K-Startup 전용 파서
  if (siteType === 'kstartup') {
    const pbancClssCd = extractKStartupPbancClssCd(sourceUrl);
    return parseKStartupHtml($, sourceUrl, hoursFilter, pbancClssCd);
  }

  // 테크노파크 전용 파서
  if (siteType === 'technopark') {
    return parseTechnoparkHtml($, sourceUrl, hoursFilter);
  }

  // 기업마당 파서 (기본)
  return parseBizinfoHtml($, sourceUrl, hoursFilter);
}

/**
 * 지역명을 기관명으로 변환 (테크노파크 전용)
 * 지역 카테고리 → 해당 지역 테크노파크 기관명
 */
function regionToTechnoparkOrg(region: string): string {
  const regionOrgMap: Record<string, string> = {
    'TP진흥회': '한국테크노파크진흥회',
    '강원': '강원테크노파크',
    '경기': '경기테크노파크',
    '경기대진': '경기대진테크노파크',
    '경남': '경남테크노파크',
    '경북': '경북테크노파크',
    '광주': '광주테크노파크',
    '대구': '대구테크노파크',
    '대전': '대전테크노파크',
    '부산': '부산테크노파크',
    '서울': '서울테크노파크',
    '세종': '세종테크노파크',
    '울산': '울산테크노파크',
    '인천': '인천테크노파크',
    '전남': '전남테크노파크',
    '전북': '전북테크노파크',
    '제주': '제주테크노파크',
    '충남': '충남테크노파크',
    '충북': '충북테크노파크',
    '포항': '포항테크노파크',
  };
  return regionOrgMap[region] || `${region}테크노파크`;
}

/**
 * Parse 테크노파크 HTML content
 * 테크노파크 테이블 구조 파서
 *
 * 지원 구조:
 * 1. central - 한국테크노파크진흥원 (technopark.kr): [번호, 지역, 제목, 작성자, 등록일, 조회]
 * 2. individual - 부산테크노파크 (btp.or.kr): [번호, 사업공고명, 접수기간, 상태, 작성자, 게시일, 조회]
 * 3. simple - 강원테크노파크 등: [번호, 제목, 작성자, 등록일, 조회수, 첨부]
 * 4. generic - 기타 사이트: 링크+날짜 패턴으로 자동 감지
 */
function parseTechnoparkHtml(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number
): CrawledProject[] {
  const projects: CrawledProject[] = [];

  // URL에서 지역 추출 (개별 테크노파크용)
  const regionFromUrl = extractRegionFromTechnoparkUrl(sourceUrl);
  logger.debug(`[Technopark] URL: ${sourceUrl}, Extracted region: ${regionFromUrl}`);

  // 테이블 구조 감지
  const tableType = detectTechnoparkTableType($);
  logger.info(`[Technopark] Detected table type: ${tableType} for ${sourceUrl}`);

  // ========================================
  // 전북테크노파크: div 기반 구조 처리 (테이블 없음)
  // 구조: .mb_s_list > .mb_li_box (a href="javascript:doAction('detail','ID','')")
  // ========================================
  const jbtpItems = $(".mb_s_list .mb_li_box");
  if (jbtpItems.length > 0) {
    logger.info(`[Technopark] 전북TP div structure detected: ${jbtpItems.length} items`);

    jbtpItems.each((_idx, item) => {
      const $item = $(item);
      const $link = $item.find("a").first();

      if (!$link.length) return;

      const href = $link.attr("href") || "";
      const linkText = $link.text().trim();

      // 제목 추출 (링크 텍스트에서 줄바꿈 제거 후 첫 줄만 사용)
      const titleLines = linkText.split(/\s+/).filter(t => t.length > 0);
      let name = titleLines.slice(0, 10).join(" "); // 최대 10 토큰

      // 너무 짧은 제목 스킵
      if (name.length < 5) return;

      // doAction('detail','202511002','') 패턴에서 ID 추출
      const doActionMatch = href.match(/doAction\s*\(\s*['"]detail['"]\s*,\s*['"]([^'"]+)['"]/);
      let detailUrl = "";
      if (doActionMatch) {
        const pblancNo = doActionMatch[1];
        // 상세 URL 구성: baseUrl + view page + parameter
        try {
          const baseUrl = new URL(sourceUrl);
          const basePath = baseUrl.pathname.replace(/_list_/, "_view_"); // list → view
          detailUrl = `${baseUrl.origin}${basePath}?PBLANC_NO=${pblancNo}`;
        } catch (e) {
          // URL 파싱 실패 시 무시
        }
      }

      // 날짜는 전북TP에서 직접 표시되지 않음 - 현재 날짜 사용
      const today = new Date();
      const uploadDate = today.toISOString().split("T")[0];

      if (name && detailUrl) {
        projects.push({
          name: name.substring(0, 200),
          organization: regionToTechnoparkOrg(regionFromUrl),
          region: regionFromUrl || "전북",
          category: "지원사업",
          target: "중소기업", // 기본값
          summary: name.substring(0, 200), // 기본값은 제목
          sourceUrl,
          detailUrl,
        });
      }
    });

    logger.info(`[Technopark] 전북TP parsed ${projects.length} projects`);
    return projects;
  }

  // 테크노파크 테이블 셀렉터 - 더 많은 패턴 지원
  const selectors = [
    "table.board-list tbody tr",
    "table.list tbody tr",
    "table tbody tr",
    ".board-list tbody tr",
    ".list-wrap tbody tr",
    "tbody tr",
    "table tr",
  ];

  for (const selector of selectors) {
    const rows = $(selector);
    if (rows.length > 0) {
      logger.debug(`[Technopark] Selector "${selector}": ${rows.length} rows`);

      rows.each((_idx, element) => {
        // Skip header row (th만 있고 td가 없는 경우)
        const thCount = $(element).find('th').length;
        const tdCount = $(element).find('td').length;
        if (thCount > 0 && tdCount === 0) {
          return; // Pure header row
        }
        const headerText = $(element).text().toLowerCase();
        if (headerText.includes('번호') && (headerText.includes('제목') || headerText.includes('공고명'))) {
          return;
        }

        const $row = $(element);
        const cells = $row.find("td");
        if (cells.length < 3) return;

        // Skip notice/pinned rows - 단, 실제 데이터가 있는 행은 파싱
        // 강원테크노파크 등 모든 공고가 "공지"로 표시되는 경우가 있음
        const firstCellText = $(cells[0]).text().trim();
        const hasLink = $row.find('a[href]').length > 0;
        const hasDate = $row.text().match(/\d{4}[.\-\/]\d{2}[.\-\/]\d{2}/);

        // 공지/필독이지만 링크와 날짜가 없는 경우만 스킵 (순수 공지 헤더)
        if ((firstCellText === '공지' || firstCellText === '필독' || firstCellText === 'notice' || firstCellText === 'Notice')
            && !hasLink && !hasDate) {
          return;
        }

        let name = "";
        let region = regionFromUrl; // URL에서 추출한 지역 기본값
        let detailUrl = "";
        let uploadDate = "";

        if (tableType === 'individual') {
          // 부산테크노파크 구조: [번호, 사업공고명, 접수기간, 상태, 작성자, 게시일, 조회]
          // 광주테크노파크 구조: [사업명, 접수기간, 담당자, 조회수, 접수상태] - 번호가 TH에 있음
          cells.each((cellIdx, cell) => {
            const text = $(cell).text().trim();

            // Cell 0~2: 사업공고명 (링크 포함) - 첫 번째 링크 셀 사용
            // 부산TP: cellIdx 1, 광주TP: cellIdx 0, 대구TP: cellIdx 2
            if (cellIdx <= 2 && $(cell).find("a").length > 0 && !name) {
              const $link = $(cell).find("a").first();
              name = $link.text().trim();
              // 중복된 텍스트 제거 (부산TP는 제목이 2번 반복됨)
              if (name.length > 10) {
                const half = Math.floor(name.length / 2);
                const firstHalf = name.substring(0, half);
                const secondHalf = name.substring(half);
                if (firstHalf === secondHalf) {
                  name = firstHalf;
                }
              }

              const href = $link.attr("href");
              // href가 유효한 경우 (# 또는 javascript:로 시작하지 않음)
              if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
                detailUrl = resolveTechnoparkUrl(sourceUrl, href);
              } else {
                // 대구TP: onclick에서 fn_egov_inqire_notice 패턴 추출
                // 패턴: fn_egov_inqire_notice('nttId', 'bbsId', 'frstRegisterId')
                const onclick = $link.attr("onclick") || "";
                const fnMatch = onclick.match(/fn_egov_inqire_notice\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
                if (fnMatch) {
                  const [, nttId, bbsId] = fnMatch;
                  try {
                    const baseUrl = new URL(sourceUrl);
                    detailUrl = `${baseUrl.origin}/bbs/BoardControllView.do?nttId=${nttId}&bbsId=${bbsId}`;
                  } catch (e) { /* ignore */ }
                }

                // 울산TP: data-seq 속성에서 ID 추출
                // 패턴: <a href="#divView" data-seq="433"> → {sourceUrl}&task=view&seq=433
                if (!detailUrl) {
                  const dataSeq = $link.attr("data-seq");
                  if (dataSeq) {
                    try {
                      const baseUrl = new URL(sourceUrl);
                      // 기존 쿼리 파라미터 유지하고 task=view&seq=XXX 추가
                      baseUrl.searchParams.set("task", "view");
                      baseUrl.searchParams.set("seq", dataSeq);
                      detailUrl = baseUrl.toString();
                    } catch (e) { /* ignore */ }
                  }
                }
              }
            }

            // 날짜 찾기 - 게시일 또는 접수기간 (다양한 위치)
            // 부산TP: cellIdx 5, 광주TP: cellIdx 1에 접수기간 있음
            if (!uploadDate) {
              const dateMatch = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
              if (dateMatch) {
                uploadDate = dateMatch[0].replace(/\./g, '-');
              }
            }
          });
        } else if (tableType === 'central') {
          // central 타입: 지역 열이 있는 테이블
          // 한국테크노파크진흥원: [번호, 지역, 제목, 작성자, 등록일, 조회]
          // 경기테크노파크: [No, 공고 제목, 사업유형, 지역, 주최기관, 접수 기간]
          cells.each((cellIdx, cell) => {
            const text = $(cell).text().trim();

            // 제목 찾기: 링크가 있는 셀 (다양한 위치 지원)
            // cellIdx 1~3 범위에서 링크가 있는 셀을 제목으로 사용
            if (cellIdx >= 1 && cellIdx <= 3 && $(cell).find("a").length > 0 && !name) {
              const $link = $(cell).find("a").first();
              name = $link.text().trim();

              const href = $link.attr("href");
              // href가 "#none", "#", "javascript:" 등이면 onclick에서 ID 추출
              if (href && href !== "#none" && href !== "#" && !href.startsWith("javascript:")) {
                detailUrl = resolveTechnoparkUrl(sourceUrl, href);
              } else {
                // onclick에서 ID 추출 시도 (예: fn_goView('172142'))
                const onclick = $link.attr("onclick") || $(cell).attr("onclick");
                if (onclick) {
                  const idMatch = onclick.match(/['"](\d{5,})['"]|View\((\d+)\)|Detail\((\d+)\)|goView\((\d+)\)/i);
                  if (idMatch) {
                    const extractedId = idMatch[1] || idMatch[2] || idMatch[3] || idMatch[4];
                    // 상세 URL 패턴 추측
                    const baseUrl = new URL(sourceUrl);
                    const viewPath = sourceUrl.replace(/List\.do|list\.do/, 'View.do');
                    detailUrl = `${viewPath}?seq=${extractedId}`;
                  }
                }
              }
            }

            // 지역 찾기: "지역" 헤더 아래 또는 짧은 지역명
            // 한국TP: cellIdx 1, 경기TP: cellIdx 3
            if (!region && text.length >= 2 && text.length < 20) {
              // 지역 패턴 확인 (시/도 이름 또는 "전체" 포함)
              if (text.includes('전체') || text.match(/^(서울|경기|인천|강원|충북|충남|대전|세종|전북|전남|광주|경북|경남|대구|부산|울산|제주|전국)/)) {
                region = text;
              }
            }

            // 날짜 찾기: 다양한 위치에서 날짜 패턴 검색
            if (!uploadDate) {
              const dateMatch = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
              if (dateMatch) {
                uploadDate = dateMatch[0].replace(/\./g, '-');
              }
            }
          });
        } else if (tableType === 'simple') {
          // 강원테크노파크 구조: [번호, 제목, 작성자, 등록일, 조회수, 첨부]
          // 경기대진테크노파크: [번호, 제목, 작성일, 조회수]
          // 인천테크노파크: [번호, 분야, 제목, 작성일, 진행상태, 조회수]
          // 서울테크노파크: [번호, 제목, 작성자, 등록일, 조회수]
          cells.each((cellIdx, cell) => {
            const text = $(cell).text().trim();

            // Cell 1-3: 제목 (링크 포함) - 다양한 위치 지원
            if (cellIdx >= 1 && cellIdx <= 3 && $(cell).find("a").length > 0 && !name) {
              const $link = $(cell).find("a").first();
              const linkText = $link.text().trim();

              // 제목은 최소 5글자 이상이고 숫자만 있는 게 아님
              if (linkText.length >= 5 && !/^\d+$/.test(linkText)) {
                name = linkText;

                const href = $link.attr("href");
                if (href && !href.startsWith("javascript:")) {
                  detailUrl = resolveTechnoparkUrl(sourceUrl, href);
                } else if (href && href.startsWith("javascript:")) {
                  // javascript 링크에서 ID 추출
                  // fncShow('10240'), goBoardView('/user/nd19746.do','View','00003954')
                  const idMatch = href.match(/['"](\d{4,})['"]/);
                  if (idMatch) {
                    const extractedId = idMatch[1];
                    try {
                      const baseUrl = new URL(sourceUrl);
                      // 인천TP: intro.asp?tmid=13 → intro.asp?tmid=13&seq=10240
                      if (sourceUrl.includes('.asp')) {
                        const tmid = baseUrl.searchParams.get('tmid');
                        detailUrl = `${baseUrl.origin}${baseUrl.pathname}?tmid=${tmid}&seq=${extractedId}`;
                      }
                      // 서울TP: /user/nd19746.do → nd19746.do?mId=&mode=view&key=00003954
                      else if (sourceUrl.includes('.do')) {
                        detailUrl = `${baseUrl.origin}${baseUrl.pathname}?mode=view&key=${extractedId}`;
                      }
                    } catch (e) {
                      // URL 파싱 실패시 무시
                    }
                  }
                }
              }
            }

            // 날짜 찾기 (셀 인덱스 2-5 범위에서 - 인천TP는 cellIdx 3)
            if (cellIdx >= 2 && cellIdx <= 4 && !uploadDate) {
              // 4자리 연도 형식 (YYYY-MM-DD, YYYY.MM.DD)
              let dateMatch = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
              if (dateMatch) {
                uploadDate = dateMatch[0].replace(/\./g, '-');
              } else {
                // 2자리 연도 형식 (YY-MM-DD, YY.MM.DD)
                dateMatch = text.match(/(\d{2})[.\-](\d{2})[.\-](\d{2})/);
                if (dateMatch) {
                  uploadDate = `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
              }
            }
          });
        } else {
          // generic: 자동 감지 - 링크가 있는 셀에서 제목, 날짜 패턴이 있는 셀에서 날짜 추출
          // 경남TP: a 태그 없이 td에 onclick 사용
          cells.each((cellIdx, cell) => {
            const text = $(cell).text().trim();
            const $link = $(cell).find("a").first();

            // 1. 링크가 있고 제목이 아직 없으면 제목으로 사용
            if ($link.length > 0 && !name) {
              const linkText = $link.text().trim();
              // 제목은 최소 3글자 이상이고 숫자만 있는 게 아님
              if (linkText.length >= 3 && !/^\d+$/.test(linkText)) {
                name = linkText;
                const href = $link.attr("href");
                if (href) {
                  detailUrl = resolveTechnoparkUrl(sourceUrl, href);
                }
              }
            }

            // 2. 링크가 없지만 td에 onclick이 있는 경우 (경남TP 패턴)
            // goPage('S', null, '/biz/applyInfo/3573')
            if (!name && text.length >= 5 && !/^\d+$/.test(text)) {
              const onclick = $(cell).attr("onclick");
              if (onclick) {
                // 경로 추출: goPage(..., '/biz/applyInfo/3573') 또는 location.href='...'
                const pathMatch = onclick.match(/['"](\/(biz|board|sub|view)[^'"]+)['"]/);
                if (pathMatch) {
                  name = text;
                  try {
                    const baseUrl = new URL(sourceUrl);
                    detailUrl = `${baseUrl.origin}${pathMatch[1]}`;
                  } catch (e) {
                    // URL 파싱 실패시 무시
                  }
                }
              }
            }

            // 날짜 패턴 찾기 (아직 날짜가 없을 때)
            if (!uploadDate) {
              // 4자리 연도 형식 (YYYY-MM-DD, YYYY.MM.DD)
              let dateMatch = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
              if (dateMatch) {
                uploadDate = dateMatch[0].replace(/\./g, '-');
              } else {
                // 2자리 연도 형식 (YY-MM-DD, YY.MM.DD)
                dateMatch = text.match(/(\d{2})[.\-](\d{2})[.\-](\d{2})/);
                if (dateMatch) {
                  uploadDate = `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
              }
            }
          });
        }

        // 등록일 기반 필터링 - 날짜가 있고 필터 밖이면 스킵
        // 날짜가 없으면 포함 (날짜 정보가 없는 사이트 대응)
        if (uploadDate && !isWithinTimeFilter(uploadDate, hoursFilter)) {
          return;
        }

        // Skip if no valid name
        if (!name || name.length < 3 || /^\d+$/.test(name)) {
          return;
        }

        // 지역에서 organization 파생
        const organization = regionToTechnoparkOrg(region || '전국');

        // 지역명 정규화 (TP진흥회 → 전국, 경기대진 → 경기 등)
        let normalizedRegion = region;
        if (region === 'TP진흥회') {
          normalizedRegion = '전국';
        } else if (region === '경기대진') {
          normalizedRegion = '경기';
        }

        const rawProject: CrawledProject = {
          name,
          organization,
          category: "기타", // 테크노파크는 카테고리 정보가 없음
          target: "중소기업",
          region: normalizedRegion || "전국",
          summary: name,
          sourceUrl,
          detailUrl: detailUrl || undefined,
          isPermanent: false,
        };

        // Validate and normalize category/region
        const validatedProject = validateProject(rawProject);
        projects.push(validatedProject);
      });

      if (projects.length > 0) {
        break;
      }
    }
  }

  // 테이블 파싱 결과가 없으면 카드/리스트 구조 시도
  if (projects.length === 0) {
    logger.info(`[Technopark] No table results, trying card/list parser for ${sourceUrl}`);
    const cardListProjects = parseTechnoparkCardList($, sourceUrl, hoursFilter);
    if (cardListProjects.length > 0) {
      logger.info(`[Technopark] Card/list parser found ${cardListProjects.length} projects`);
      return cardListProjects;
    }
  }

  logger.info(`[Technopark] Parser found ${projects.length} projects for ${tableType} type`);
  return projects;
}

/**
 * 카드/리스트 구조 테크노파크 파서
 * 테이블이 없는 사이트 (경기대진TP, 세종TP, 제주TP, 충남TP 등) 처리
 */
function parseTechnoparkCardList(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number
): CrawledProject[] {
  const projects: CrawledProject[] = [];
  const regionFromUrl = extractRegionFromTechnoparkUrl(sourceUrl);

  // 카드/리스트 셀렉터 (우선순위 순서)
  const selectors = [
    // 경기대진TP: div 기반 테이블 (.colgroup)
    '.tbl.type_bbs .colgroup',
    '.board-list li',
    'ul.list li',
    '.list-wrap li',
    '.bbs-list li',
    '.board-wrap li',
    '[class*="board"] > ul > li',
    '[class*="list"] > li',
    '.card-list > .card',
    '.item-list > .item',
    'ul.bbs li',
    '.view-list li',
    'article.list-item',
  ];

  for (const selector of selectors) {
    const items = $(selector);
    if (items.length === 0) continue;

    logger.debug(`[Technopark Card] Selector "${selector}": ${items.length} items`);

    items.each((_idx, element) => {
      const $item = $(element);
      const text = $item.text().trim();

      // 빈 항목 스킵
      if (text.length < 10) return;

      // 공지사항 스킵
      if (text.startsWith('공지') || text.includes('[공지]') || text.includes('필독')) {
        return;
      }

      // 제목 링크 찾기
      const $link = $item.find('a').first();
      if ($link.length === 0) return;

      const name = $link.text().trim();
      if (!name || name.length < 5) return;

      // 상세 URL 추출
      let detailUrl = '';
      const href = $link.attr('href');
      if (href) {
        detailUrl = resolveTechnoparkUrl(sourceUrl, href);
      }

      // 날짜 추출 (다양한 패턴)
      let uploadDate = '';
      const datePatterns = [
        /(\d{4})[.\-](\d{2})[.\-](\d{2})/, // 2025-01-07 or 2025.01.07
        /(\d{2})[.\-](\d{2})[.\-](\d{2})/, // 25-01-07 or 25.01.07
        /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, // 2025년 1월 7일
      ];

      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (match[1].length === 4) {
            uploadDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
          } else {
            uploadDate = `20${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
          }
          break;
        }
      }

      // 날짜 필터 적용
      if (uploadDate && !isWithinTimeFilter(uploadDate, hoursFilter)) {
        return;
      }

      // 중복 체크
      const isDuplicate = projects.some(
        p => p.name === name || (p.detailUrl && p.detailUrl === detailUrl)
      );
      if (isDuplicate) return;

      const rawProject: CrawledProject = {
        name,
        organization: `${regionFromUrl}테크노파크`,
        category: "기타",
        target: "중소기업",
        region: regionFromUrl || "전국",
        summary: name,
        sourceUrl,
        detailUrl: detailUrl || undefined,
        isPermanent: false,
      };

      const validatedProject = validateProject(rawProject);
      projects.push(validatedProject);
    });

    // 결과 있으면 중단
    if (projects.length > 0) {
      break;
    }
  }

  return projects;
}

/**
 * URL에서 지역 추출 (개별 테크노파크 도메인용)
 */
function extractRegionFromTechnoparkUrl(url: string): string {
  // 긴 prefix부터 매칭해야 함 (dgtp > gtp 순서로 확인)
  // 배열로 변경하여 순서 보장
  const domainRegionMap: [string, string][] = [
    // 긴 것부터 (substring 문제 방지)
    ['seoultp', '서울'],
    ['technopark', '전국'],
    ['jejutp', '제주'],
    ['gdtpi', '경기'], // 경기대진
    ['gdtp', '경기'],  // 경기대진
    ['dgtp', '대구'],  // dgtp > gtp 먼저
    ['gjtp', '광주'],  // gjtp > jtp 먼저
    ['gntp', '경남'],
    ['gwtp', '강원'],
    ['gbtp', '경북'],
    ['cbtp', '충북'],
    ['djtp', '대전'],
    ['sjtp', '세종'],
    ['jbtp', '전북'],
    ['jntp', '전남'],
    ['gtp', '경기'],   // 짧은 것은 나중에
    ['itp', '인천'],
    ['ctp', '충남'],
    ['btp', '부산'],
    ['utp', '울산'],
    ['ptp', '경북'],   // 포항
  ];

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [prefix, region] of domainRegionMap) {
      if (hostname.includes(prefix)) {
        return region;
      }
    }
  } catch {
    // URL 파싱 실패
  }

  return '전국';
}

/**
 * 테크노파크 테이블 구조 타입 감지
 * - 'central': 한국테크노파크진흥원 (지역 열 있음)
 * - 'individual': 부산테크노파크 (접수기간, 상태 열 있음)
 * - 'simple': 강원테크노파크 등 (번호, 제목, 작성자, 등록일, 조회수)
 * - 'generic': 기타 (링크+날짜 패턴으로 자동 감지)
 */
function detectTechnoparkTableType($: ReturnType<typeof import("cheerio")["load"]>): 'central' | 'individual' | 'simple' | 'generic' {
  // 모든 테이블 헤더 텍스트 수집
  const headerTexts: string[] = [];
  $('table thead tr th, table thead tr td, table tr th').each((_, el) => {
    headerTexts.push($(el).text().trim().toLowerCase());
  });
  const headerText = headerTexts.join(' ');

  logger.debug(`[Technopark] Header text: "${headerText.substring(0, 100)}"`);

  // 한국테크노파크진흥원 특징: 지역 열이 있음
  if (headerText.includes('지역')) {
    return 'central';
  }

  // 부산테크노파크 특징: 접수기간, 상태 열이 동시에 있음
  if (headerText.includes('접수기간') && headerText.includes('상태')) {
    return 'individual';
  }

  // 강원테크노파크, 경기대진 등: 번호, 제목, 작성자, (등록일/게시일), 조회수
  // 또는: 번호, 제목, 작성자, 등록일, 조회, 첨부
  if (headerText.includes('번호') &&
      (headerText.includes('제목') || headerText.includes('공고명')) &&
      (headerText.includes('등록일') || headerText.includes('게시일') || headerText.includes('작성일'))) {
    return 'simple';
  }

  // 첫 번째 row도 확인 (테이블에 thead가 없는 경우)
  const firstRowText = $('table tr').first().text().toLowerCase();
  if (firstRowText.includes('지역')) {
    return 'central';
  }
  if (firstRowText.includes('접수기간') && firstRowText.includes('상태')) {
    return 'individual';
  }
  if (firstRowText.includes('번호') && firstRowText.includes('제목')) {
    return 'simple';
  }

  // 기본값: generic (자동 감지)
  return 'generic';
}

/**
 * 테크노파크 URL 해석 헬퍼
 */
function resolveTechnoparkUrl(sourceUrl: string, href: string): string {
  if (href.startsWith("http")) {
    return href;
  }

  try {
    const baseUrl = new URL(sourceUrl);
    if (href.startsWith("/")) {
      return `${baseUrl.protocol}//${baseUrl.host}${href}`;
    } else if (href.startsWith("?")) {
      // 쿼리스트링만 있는 경우 (예: ?mCode=MN013&mode=view&...)
      return `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname}${href}`;
    } else {
      // 상대 경로인 경우 현재 디렉토리 기준으로 해석
      // 예: /business/data.do에서 datadetail.do → /business/datadetail.do
      const pathDir = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      return `${baseUrl.protocol}//${baseUrl.host}${pathDir}${href}`;
    }
  } catch {
    return href;
  }
}

/**
 * Parse 기업마당 HTML content
 * 기업마당 테이블 구조 파서 (bizinfo.go.kr)
 */
function parseBizinfoHtml(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number
): CrawledProject[] {
  const projects: CrawledProject[] = [];

  // 디버깅: HTML 크기 확인
  const htmlSize = $.html().length;
  logger.info(`[Bizinfo] HTML size: ${htmlSize} chars`);

  // Try different selectors for 기업마당
  const selectors = [
    "table.board-list tbody tr",
    "table.table tbody tr",
    ".board-list tbody tr",
    ".list-table tbody tr",
    "tbody tr",
    "tr",
  ];

  for (const selector of selectors) {
    const rows = $(selector);
    logger.info(`[Bizinfo] Selector "${selector}": ${rows.length} rows`);

    if (rows.length > 0) {
      let processedCount = 0;
      let skippedNoDate = 0;
      let skippedDateFilter = 0;
      let skippedNoName = 0;

      // Parse each row
      rows.each((_idx, element) => {
        // Skip header row
        const headerText = $(element).text().toLowerCase();
        if (headerText.includes('번호') && headerText.includes('제목')) {
          return;
        }

        const $row = $(element);
        const cells = $row.find("td");
        if (cells.length < 2) return;

        let name = "";
        let organization = "";
        let category = "";
        let region = "";
        let detailUrl = "";
        let uploadDate = ""; // 등록일

        // 기업마당 테이블 구조 (2024.12 기준):
        // [번호(0), 지원분야(1), 지원사업명(2), 신청기간(3), 소관부처·지자체(4), 사업수행기관(5), 등록일(6), 조회수(7)]
        cells.each((cellIdx, cell) => {
          const text = $(cell).text().trim();

          // Cell 1: 카테고리 (지원분야)
          if (cellIdx === 1 && text.length >= 2 && text.length < 20) {
            category = text;
          }

          // Cell 2: 지원사업명 (링크 포함)
          if (cellIdx === 2 && $(cell).find("a").length > 0) {
            const $link = $(cell).find("a").first();
            name = $link.text().trim();

            const href = $link.attr("href");
            if (href) {
              if (href.startsWith("http")) {
                detailUrl = href;
              } else if (href.startsWith("/")) {
                const baseUrl = new URL(sourceUrl);
                detailUrl = `${baseUrl.protocol}//${baseUrl.host}${href}`;
              } else {
                const baseUrl = new URL(sourceUrl);
                const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/") + 1);
                detailUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${href}`;
              }
            }

            // 지역 추출: 제목에서 [지역] 패턴 추출 (예: "[부산] 사업명")
            const regionMatch = name.match(/^\[([가-힣]+)\]/);
            if (regionMatch) {
              region = regionMatch[1];
            }
          }

          // Cell 4: 소관부처·지자체 → organization으로 사용
          if (cellIdx === 4 && text.length >= 2) {
            organization = text;
            // 지역이 없으면 소관부처에서 지역 추출 시도
            if (!region && text.length < 20) {
              const regionFromOrg = extractRegionFromOrganization(text);
              if (regionFromOrg) {
                region = regionFromOrg;
              }
            }
          }

          // Cell 6: 등록일 (YYYY-MM-DD 형식)
          if (cellIdx === 6) {
            const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
            if (dateMatch) {
              uploadDate = dateMatch[0];
            }
          }
        });

        processedCount++;

        // 등록일 기반 필터링 - 날짜가 없거나 필터 밖이면 스킵
        if (!uploadDate) {
          skippedNoDate++;
          return;
        }
        if (!isWithinTimeFilter(uploadDate, hoursFilter)) {
          skippedDateFilter++;
          return;
        }

        // Skip if no valid name
        if (!name || name.length < 3 || /^\d+$/.test(name)) {
          skippedNoName++;
          return;
        }

        const rawProject: CrawledProject = {
          name,
          organization: organization || "미분류",
          category: category || "기타",
          target: "중소기업",
          region: region || "전국",
          summary: name,
          sourceUrl,
          detailUrl: detailUrl || undefined,
          isPermanent: false,
        };

        // Validate and normalize category/region
        const validatedProject = validateProject(rawProject);
        projects.push(validatedProject);
      });

      // 통계 로그
      logger.info(`[Bizinfo] Parse stats: processed=${processedCount}, noDate=${skippedNoDate}, dateFilter=${skippedDateFilter}, noName=${skippedNoName}, valid=${projects.length}`);

      if (projects.length > 0) {
        break;
      }
    }
  }

  return projects;
}

/**
 * Parse API response (JSON format)
 */
function parseApiResponse(data: any, sourceUrl: string): CrawledProject[] {
  const projects: CrawledProject[] = [];

  // Assuming API returns array of projects
  const items = Array.isArray(data) ? data : data.items || data.data || [];

  items.forEach((item: any) => {
    const rawProject: CrawledProject = {
      externalId: item.id?.toString(),
      name: item.name || item.title || "정보 없음",
      organization: item.organization || item.agency || "미상",
      category: item.category || "기타",
      subCategory: item.subCategory,
      target: item.target || "중소기업",
      region: item.region || "전국",
      summary: item.summary || item.description || "",
      description: item.description,
      eligibility: item.eligibility,
      applicationProcess: item.applicationProcess,
      sourceUrl,
      websiteUrl: item.url,
    };

    // Validate and normalize category/region
    const validatedProject = validateProject(rawProject);
    projects.push(validatedProject);
  });

  return projects;
}

/**
 * Save crawled projects to database with upsert logic
 * NEW: 프로젝트 저장 후 첨부파일 처리
 */
async function saveProjects(
  projects: CrawledProject[]
): Promise<{ newCount: number; updatedCount: number; filesProcessed: number }> {
  let newCount = 0;
  let updatedCount = 0;
  let filesProcessed = 0;

  for (const project of projects) {
    try {
      // Try to find existing project by externalId or name+organization
      const existing = project.externalId
        ? await prisma.supportProject.findUnique({
            where: { externalId: project.externalId },
          })
        : await prisma.supportProject.findFirst({
            where: {
              name: project.name,
              organization: project.organization,
            },
          });

      // Prepare project data (exclude savedAttachments, cookies which are not in schema)
      const { savedAttachments: _savedAttachments, attachmentUrls, cookies, ...projectData } = project;

      let projectId: string;

      // 정규화 필드 추출
      const normalized = normalizeProject(project.name);

      if (existing) {
        // Update existing project
        await prisma.supportProject.update({
          where: { id: existing.id },
          data: {
            ...projectData,
            crawledAt: new Date(),
            updatedAt: new Date(),
            needsEmbedding: true, // Re-queue for embedding update
            // 정규화 필드 업데이트
            normalizedName: normalized.normalizedName,
            projectYear: normalized.projectYear,
          },
        });
        projectId = existing.id;
        updatedCount++;
        logger.debug(`Updated project: ${project.name}`);
      } else {
        // Create new project with normalized fields
        const created = await prisma.supportProject.create({
          data: {
            ...projectData,
            crawledAt: new Date(),
            status: "active",
            needsEmbedding: true, // Queue for async embedding generation
            // 정규화 필드 추가
            normalizedName: normalized.normalizedName,
            projectYear: normalized.projectYear,
          },
        });
        projectId = created.id;
        newCount++;
        logger.debug(`Created project: ${project.name}`);

        // 중복 감지 및 그룹 처리 (새 프로젝트만)
        try {
          const dedupeResult = await processProjectDeduplication(created);
          if (dedupeResult.action === "merged") {
            logger.info(
              `Project merged into group ${dedupeResult.groupId} (confidence: ${(dedupeResult.mergeConfidence * 100).toFixed(1)}%, duplicates: ${dedupeResult.duplicatesFound})`
            );
          } else if (dedupeResult.action === "review") {
            logger.info(
              `Project flagged for review in group ${dedupeResult.groupId} (confidence: ${(dedupeResult.mergeConfidence * 100).toFixed(1)}%)`
            );
          } else {
            logger.debug(`New project group created: ${dedupeResult.groupId}`);
          }
        } catch (dedupeError) {
          // 중복 감지 실패해도 프로젝트 저장은 유지
          logger.error("Deduplication processing failed", { error: dedupeError });
        }
      }

      // Process and save attachments (NEW)
      if (attachmentUrls && attachmentUrls.length > 0) {
        logger.debug(`Processing ${attachmentUrls.length} attachment(s)...`);

        try {
          // 기존 프로젝트 업데이트 시, 기존 attachments 삭제 (중복 방지)
          if (existing) {
            const deletedCount = await prisma.projectAttachment.deleteMany({
              where: { projectId },
            });
            if (deletedCount.count > 0) {
              logger.debug(`Removed ${deletedCount.count} existing attachment(s)`);
            }
          }

          const { attachments, aiAnalysis } = await processProjectFiles(
            projectId,
            attachmentUrls,
            project.cookies
          );

          // Save attachments to database
          for (const attachment of attachments) {
            await prisma.projectAttachment.create({
              data: {
                projectId,
                fileName: attachment.fileName,
                fileType: attachment.fileType,
                fileSize: attachment.fileSize,
                // storagePath: 빈 문자열이면 null로 저장 (핵심 문서만 Storage에 저장됨)
                storagePath: attachment.storagePath || null,
                sourceUrl: attachment.sourceUrl,
                shouldParse: attachment.shouldParse,
                isParsed: attachment.isParsed,
                parsedContent: attachment.parsedContent,
                parseError: attachment.parseError,
              },
            });
            filesProcessed++;
          }

          logger.debug(`Saved ${attachments.length} attachment(s) to DB`);

          // Update project with AI analysis if available
          if (aiAnalysis) {
            // Parse dates if provided
            const parseDate = (dateStr?: string): Date | undefined => {
              if (!dateStr) return undefined;
              const date = new Date(dateStr);
              return isNaN(date.getTime()) ? undefined : date;
            };

            // Convert amounts to BigInt for database storage
            const parseBigInt = (amount?: number): bigint | undefined => {
              if (amount === undefined || amount === null || isNaN(amount)) return undefined;
              return BigInt(Math.round(amount));
            };

            await prisma.supportProject.update({
              where: { id: projectId },
              data: {
                // AI 분석 결과로 모든 상세 필드 업데이트
                summary: aiAnalysis.summary || undefined,
                description: aiAnalysis.description || undefined,
                eligibility: aiAnalysis.eligibility || undefined,
                applicationProcess: aiAnalysis.applicationProcess || undefined,
                evaluationCriteria: aiAnalysis.evaluationCriteria || undefined,
                fundingSummary: aiAnalysis.fundingSummary || undefined,
                amountDescription: aiAnalysis.amountDescription || undefined,
                // NEW: 지원금액 숫자 필드 업데이트
                amountMin: parseBigInt(aiAnalysis.amountMin),
                amountMax: parseBigInt(aiAnalysis.amountMax),
                deadline: parseDate(aiAnalysis.deadline),
                startDate: parseDate(aiAnalysis.startDate),
                endDate: parseDate(aiAnalysis.endDate),
              },
            });

            // Log amount extraction result
            if (aiAnalysis.amountMin || aiAnalysis.amountMax) {
              logger.info(`Updated project amounts: min=${aiAnalysis.amountMin}, max=${aiAnalysis.amountMax}`);
            }
            logger.debug("Updated project with AI analysis (summary, description, eligibility, amounts, etc.)");
          }
        } catch (fileError) {
          logger.error("Error processing attachments", { error: fileError });
        }

        // Rate limiting: 2 seconds between projects with files
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error(`Failed to save project "${project.name}"`, { error });
      // Continue with next project
    }
  }

  return { newCount, updatedCount, filesProcessed };
}

/**
 * Get pending crawl jobs and process them
 * This would typically be called by a background worker/cron job
 */
export async function processPendingJobs() {
  const pendingJobs = await prisma.crawlJob.findMany({
    where: {
      status: "pending",
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 5, // Process 5 jobs at a time
  });

  logger.info(`Processing ${pendingJobs.length} pending crawl jobs`);

  for (const job of pendingJobs) {
    try {
      await processCrawlJob(job.id);
    } catch (error) {
      logger.error(`Failed to process job ${job.id}`, { error });
      // Continue with next job even if one fails
    }
  }
}
