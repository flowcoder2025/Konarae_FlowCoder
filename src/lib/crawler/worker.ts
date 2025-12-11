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

/**
 * HTTP Agents with Keep-Alive for connection reuse
 * Critical for serverless environments to reduce connection overhead
 */
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5,
  timeout: 20000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5,
  timeout: 20000,
});

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        console.log(`    ⚠ Attempt ${attempt + 1} failed (${error.code || error.message}), retrying in ${delay}ms...`);
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
    console.log(`Starting crawl: ${job.source.url} (${job.source.type})`);
    const crawledProjects = await crawlAndParse(
      job.source.url,
      job.source.type
    );

    console.log(`Found ${crawledProjects.length} projects`);

    // Save projects to database (includes file processing)
    console.log(`\n=== Step 3+4: Saving projects and processing files ===`);
    const { newCount, updatedCount, filesProcessed } = await saveProjects(crawledProjects);

    console.log(`\n=== Crawl Summary ===`);
    console.log(`Projects: ${newCount} new, ${updatedCount} updated`);
    console.log(`Files processed: ${filesProcessed}`);

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

    console.log(`Crawl job ${jobId} completed successfully`, stats);
    return stats;
  } catch (error) {
    console.error(`Crawl job ${jobId} failed:`, error);

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

  // ===== K-Startup specific pattern =====
  // HTML 구조:
  // <div class="board_file">
  //   <a class="file_bg" title="[첨부파일] 파일명.pdf">...</a>
  //   <a href="/afile/fileDownload/gT8Ln" class="btn_down">
  // </div>
  if (isKStartup) {
    console.log(`    → Using K-Startup file extractor`);

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
      console.log(`    → Found ${fileUrls.length} K-Startup file(s)`);
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
 * Fetch detail page and extract file URLs
 * Enhanced with retry logic and HTTP agents for Vercel compatibility
 */
async function fetchDetailPage(
  detailUrl: string,
  baseUrl: string
): Promise<string[]> {
  try {
    const axios = (await import("axios")).default;
    const { load } = await import("cheerio");

    console.log(`  → Fetching detail page: ${detailUrl}`);

    const response = await fetchWithRetry(
      () => axios.get(detailUrl, {
        timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
        httpAgent,
        httpsAgent,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "Connection": "keep-alive",
        },
      }),
      { retries: 2, initialDelayMs: 1000 }
    );

    const $ = load(response.data);
    const fileUrls = extractFileUrls($, detailUrl);

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

    console.log(`  → Found ${absoluteUrls.length} file(s)`);
    return absoluteUrls;
  } catch (error: any) {
    console.error(`  ✗ Failed to fetch detail page ${detailUrl}: ${error.code || error.message}`);
    return [];
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

  // Pattern E: Uncommon Korean syllables (UTF-8 misread as EUC-KR/CP949)
  // Characters like 챗, 쩻, 햇 etc. appearing in unusual combinations
  // These are valid Unicode but appear when UTF-8 bytes are wrongly decoded as CP949
  // Check for rare Korean syllables that shouldn't appear frequently in normal text
  const rareKoreanSyllables = /[챗쩻햇챙멜헐긟럛뷁뫃믃샻쐓쏳췃츣킧팣핣횣]/;
  const hasMultipleRare = (fileName.match(rareKoreanSyllables) || []).length >= 2;

  // Pattern F: Mixed encoding artifacts - unusual character sequences
  // Korean text with special chars like (챗쩻햇챙멜헐2) is suspicious
  const mixedArtifactPattern = /\([가-힣]+\d+\)|\d+[가-힣]+\d+/;
  const hasArtifact = mixedArtifactPattern.test(fileName) && hasMultipleRare;

  return jamoPattern.test(fileName) ||
         latin1Pattern.test(fileName) ||
         replacementPattern.test(fileName) ||
         suspiciousChinesePattern.test(fileName) ||
         hasMultipleRare ||
         hasArtifact;
}

/**
 * Attempt to repair a corrupted filename
 * Tries multiple decoding strategies
 */
async function repairCorruptedFileName(fileName: string): Promise<string> {
  const iconv = (await import('iconv-lite')).default;

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
      console.log(`    ✓ Repaired filename (CP949→UTF-8): "${fileName}" → "${utf8Decoded}"`);
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
      console.log(`    ✓ Repaired filename (EUC-KR→UTF-8): "${fileName}" → "${utf8Decoded}"`);
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
 * Step 3: Download file from URL
 * Returns buffer and actual filename from Content-Disposition header
 * Enhanced with retry logic and HTTP agents for Vercel compatibility
 */
async function downloadFile(url: string): Promise<DownloadResult | null> {
  try {
    const axios = (await import("axios")).default;

    console.log(`    → Downloading file...`);

    const response = await fetchWithRetry(
      () => axios.get(url, {
        responseType: 'arraybuffer',
        timeout: CRAWLER_CONFIG.FILE_TIMEOUT,
        maxContentLength: 10 * 1024 * 1024, // 10MB limit
        httpAgent,
        httpsAgent,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Connection": "keep-alive",
        },
      }),
      { retries: 2, initialDelayMs: 2000 }
    );

    const buffer = Buffer.from(response.data);
    const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);

    // Extract actual filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const fileName = await extractFileNameFromHeader(contentDisposition);

    if (fileName) {
      console.log(`    ✓ Downloaded ${sizeInMB}MB - "${fileName}"`);
    } else {
      console.log(`    ✓ Downloaded ${sizeInMB}MB`);
    }

    // Debug: Check first 100 bytes to verify file type
    const preview = buffer.slice(0, 100).toString('utf8', 0, 100);
    if (preview.includes('<!DOCTYPE') || preview.includes('<html')) {
      console.error(`    ✗ Downloaded HTML instead of file!`);
      console.error(`    Preview: ${preview.substring(0, 200)}`);
      return null;
    }

    return { buffer, fileName };
  } catch (error: any) {
    console.error(`    ✗ Download failed:`, error.message);
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
      console.log(`    ✓ Local HWP parser extracted ${fullText.length} characters`);
      return fullText;
    }
  } catch (error: any) {
    console.log(`    ⚠ hwp.js failed: ${error.message}`);
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
      console.log(`    ✓ Local HWPX parser extracted ${fullText.length} characters`);
      return fullText;
    }
  } catch (error: any) {
    console.log(`    ⚠ HWPX local parser failed: ${error.message}`);
  }

  return null;
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
      console.log(`    ✗ Unknown file format`);
      return null;
    }

    console.log(`    → Detected file type: ${fileType.toUpperCase()}`);

    // Try text_parser service first
    console.log(`    → Trying text_parser ${fileType.toUpperCase()} parser...`);
    try {
      const { parseDocument } = await import("@/lib/document-parser");
      const result = await parseDocument(buffer, fileType, 'text');

      if (result.success && result.text.length > 0) {
        const textLength = result.text.length;
        console.log(`    ✓ text_parser extracted ${textLength} characters`);

        // Limit text to first 10,000 characters for API efficiency
        const limitedText = result.text.substring(0, 10000);
        return limitedText;
      } else {
        console.log(`    ⚠ text_parser returned no text, trying local fallback...`);
      }
    } catch (parserError: any) {
      console.log(`    ⚠ text_parser failed: ${parserError.message}`);
      console.log(`    → Falling back to local parsing...`);
    }

    // Fallback to local parsing
    let extractedText: string | null = null;

    if (fileType === 'hwp') {
      extractedText = await parseHwpLocal(buffer);
    } else if (fileType === 'hwpx') {
      extractedText = await parseHwpxLocal(buffer);
    } else if (fileType === 'pdf') {
      // Keep PDF parsing as-is or add local fallback later
      console.log(`    ⚠ PDF local parsing not implemented yet`);
      return null;
    }

    if (extractedText && extractedText.length > 0) {
      // Limit text to first 10,000 characters for API efficiency
      const limitedText = extractedText.substring(0, 10000);
      return limitedText;
    }

    console.log(`    ✗ All parsing methods failed`);
    return null;

  } catch (error: any) {
    console.error(`    ✗ File extraction failed:`, error.message);
    return null;
  }
}

/**
 * Step 4: Analyze document with Gemini AI
 */
async function analyzeWithGemini(text: string): Promise<{
  summary?: string;
  description?: string;
  eligibility?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
  fundingSummary?: string;
  amountDescription?: string;
  deadline?: string;
  startDate?: string;
  endDate?: string;
} | null> {
  try {
    // Check if API key is available
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log(`    ⚠ Gemini API key not configured, skipping AI analysis`);
      return null;
    }

    const { google } = await import("@ai-sdk/google");
    const { generateText } = await import("ai");

    console.log(`    → Analyzing with Gemini AI...`);

    const model = google("gemini-2.5-flash");

    const prompt = `다음은 정부 지원사업 공고문입니다. 아래 정보를 JSON 형식으로 추출해주세요:

1. summary: 사업 요약 (1문장, 30~50자, 핵심 내용만. 예: "창업 3년 이내 기업 대상 최대 1억원 지원")
2. description: 사업의 목적과 개요 (2-3문장, 핵심만)
3. eligibility: 신청 자격 요건 (핵심만, 있는 경우)
4. applicationProcess: 신청 방법 및 절차 (간단히, 있는 경우)
5. evaluationCriteria: 평가 기준 (있는 경우)
6. fundingSummary: 지원 금액을 한 줄로 간결하게 요약 (예: "최대 400만원", "업체당 500만원 이내", "최대 1억원 (전액 무상)", "70% 보조금 지원"). 반드시 10~30자 이내로 핵심만 작성.
7. amountDescription: 지원 금액에 대한 상세 설명. 세부 항목별 금액, 지원 조건, 자부담 비율 등 상세 내용을 포함.
8. deadline: 신청 마감일 (YYYY-MM-DD 형식, 있는 경우)
9. startDate: 사업/접수 시작일 (YYYY-MM-DD 형식, 있는 경우)
10. endDate: 사업/접수 종료일 (YYYY-MM-DD 형식, 있는 경우)

응답은 반드시 다음 JSON 형식으로만 작성해주세요:
{
  "summary": "...",
  "description": "...",
  "eligibility": "...",
  "applicationProcess": "...",
  "evaluationCriteria": "...",
  "fundingSummary": "...",
  "amountDescription": "...",
  "deadline": "2025-12-31",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}

정보가 없는 항목은 생략하세요. 날짜는 반드시 YYYY-MM-DD 형식으로 작성하세요.

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
      console.log(`    ✗ Failed to extract JSON from response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`    ✓ AI analysis complete`);

    return parsed;
  } catch (error: any) {
    console.error(`    ✗ Gemini analysis failed:`, error.message);
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
  attachmentUrls: string[]
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

  console.log(`  → Processing ${sortedFiles.length} file(s)`);
  let firstParsedText: string | null = null;

  for (let i = 0; i < sortedFiles.length; i++) {
    const { url, fileName: urlFileName, fileType } = sortedFiles[i];

    // URL에서 파일 타입을 알 수 없는 경우 (예: getImageFile.do) 일단 다운로드 필요
    const needsDownloadToCheck = fileType === 'unknown' || urlFileName.includes('getImageFile');
    const preliminaryShouldParse = shouldParseFile(urlFileName);

    console.log(`  [${i + 1}/${sortedFiles.length}] ${urlFileName}`);

    // URL에서 타입을 알 수 없으면 일단 다운로드해서 확인
    if (needsDownloadToCheck) {
      console.log(`    → Type unknown, downloading to check...`);

      const downloadResult = await downloadFile(url);
      if (!downloadResult) {
        console.log(`    ✗ Download failed, recording URL only`);
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

      console.log(`    → Actual filename: "${finalFileName}"`);
      console.log(`    → Detected type: ${detectedType}, Storage: ${actualShouldParse ? 'YES (핵심문서)' : 'NO (URL만 저장)'}`);

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
        console.log(`    ✓ URL recorded (not a key document)`);
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
        console.log(`    ✗ Upload failed: ${uploadResult.error}`);
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

      console.log(`    ✓ Stored: ${uploadResult.storagePath}`);

      // 텍스트 추출
      let parsedContent: string | undefined;
      let parseError: string | undefined;
      let isParsed = false;

      try {
        const text = await extractFileText(fileBuffer);
        if (text && text.length > 0) {
          parsedContent = text;
          isParsed = true;
          console.log(`    ✓ Parsed ${text.length} characters`);
          if (!firstParsedText) firstParsedText = text;
        } else {
          parseError = 'No text extracted';
          console.log(`    ⚠ No text extracted`);
        }
      } catch (error) {
        parseError = error instanceof Error ? error.message : 'Unknown parsing error';
        console.log(`    ✗ Parse error: ${parseError}`);
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
    console.log(`    → Type: ${fileType}, Storage: ${preliminaryShouldParse ? 'YES (핵심문서)' : 'NO (URL만 저장)'}`);

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
      console.log(`    ✓ URL recorded (no download)`);
      continue;
    }

    // ===== 파싱 대상: 다운로드 → Storage 저장 → 텍스트 추출 =====

    // Step 1: 파일 다운로드 + Content-Disposition 파일명 추출
    const downloadResult = await downloadFile(url);
    if (!downloadResult) {
      console.log(`    ✗ Download failed, recording URL only`);
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
      console.log(`    ✗ Upload failed: ${uploadResult.error}`);
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

    console.log(`    ✓ Stored: ${uploadResult.storagePath}`);
    console.log(`    ✓ Filename: "${finalFileName}"`);

    // Step 4: 텍스트 추출
    let parsedContent: string | undefined;
    let parseError: string | undefined;
    let isParsed = false;

    try {
      const text = await extractFileText(fileBuffer);
      if (text && text.length > 0) {
        parsedContent = text;
        isParsed = true;
        console.log(`    ✓ Parsed ${text.length} characters`);

        // 첫 번째 파싱된 텍스트를 AI 분석에 사용
        if (!firstParsedText) {
          firstParsedText = text;
        }
      } else {
        parseError = 'No text extracted';
        console.log(`    ⚠ No text extracted`);
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Unknown parsing error';
      console.log(`    ✗ Parse error: ${parseError}`);
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
    console.log(`  → Running AI analysis on parsed content...`);
    aiAnalysis = await analyzeWithGemini(firstParsedText) || undefined;
  }

  return { attachments, aiAnalysis };
}

/**
 * Crawler configuration
 * Vercel serverless 환경 최적화 (maxDuration: 60초)
 *
 * 성수기 대응 시 Railway 서비스로 분리 권장
 */
const CRAWLER_CONFIG = {
  // 페이지네이션 설정 (Vercel 60초 타임아웃 대응)
  MAX_PAGES: 3,            // 10 → 3 (약 45개 항목)
  PAGE_SIZE: 15,           // 기업마당 기본 페이지 크기
  MAX_PROJECTS: 30,        // 150 → 30 (Vercel 타임아웃 내 처리 가능)

  // 시간 필터 설정
  HOURS_FILTER: 28,        // N시간 이내 등록된 공고만 수집

  // 요청 간격 (rate limiting - 증가시켜 안정성 향상)
  PAGE_DELAY_MS: 1000,     // 500 → 1000 (서버 부하 감소)
  DETAIL_DELAY_MS: 1500,   // 500 → 1500 (연결 안정성)
  FILE_DELAY_MS: 2000,     // 파일 처리 간 딜레이

  // 타임아웃 설정 (Vercel 환경 최적화)
  REQUEST_TIMEOUT: 15000,  // 30초 → 15초 (빠른 실패 & 재시도)
  FILE_TIMEOUT: 30000,     // 파일 다운로드는 30초 유지
};

/**
 * Check if upload date is within time filter
 * 기업마당 등록일 형식: "2025-12-05" (YYYY-MM-DD)
 */
function isWithinTimeFilter(dateStr: string, hoursFilter: number): boolean {
  try {
    // 날짜 파싱
    const uploadDate = new Date(dateStr);
    if (isNaN(uploadDate.getTime())) {
      console.log(`  ⚠ Invalid date format: ${dateStr}, including anyway`);
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
 * Build paginated URL for 기업마당
 * 기업마당 URL 패턴: ?pageIndex=N 또는 ?cpage=N
 */
function buildPaginatedUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);

  // 기존 페이지 파라미터 제거
  url.searchParams.delete('pageIndex');
  url.searchParams.delete('cpage');
  url.searchParams.delete('page');

  // 새 페이지 파라미터 추가 (기업마당은 pageIndex 사용)
  url.searchParams.set('pageIndex', pageIndex.toString());

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
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json,*/*",
            "Connection": "keep-alive",
          },
        }),
        { retries: 2 }
      );
      allProjects = parseApiResponse(response.data, url);
    } else {
      // Web scraping (HTML) - 페이지네이션 지원
      const siteType = detectSiteType(url);
      console.log(`\n=== Step 1: Crawling ${siteType} with pagination (max ${CRAWLER_CONFIG.MAX_PAGES} pages) ===`);

      let pageIndex = 1;
      let consecutiveEmptyPages = 0;

      while (pageIndex <= CRAWLER_CONFIG.MAX_PAGES && allProjects.length < CRAWLER_CONFIG.MAX_PROJECTS) {
        // 사이트별 페이지네이션 URL 생성
        const pageUrl = siteType === 'kstartup'
          ? buildKStartupPaginatedUrl(url, pageIndex)
          : buildPaginatedUrl(url, pageIndex);
        console.log(`\n[Page ${pageIndex}/${CRAWLER_CONFIG.MAX_PAGES}] ${pageUrl}`);

        try {
          const response = await fetchWithRetry(
            () => axios.get(pageUrl, {
              timeout: CRAWLER_CONFIG.REQUEST_TIMEOUT,
              httpAgent,
              httpsAgent,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Connection": "keep-alive",
              },
            }),
            { retries: 2, initialDelayMs: 1000 }
          );

          const $ = load(response.data);
          const pageProjects = parseHtmlContentWithDateFilter($, url, CRAWLER_CONFIG.HOURS_FILTER);

          console.log(`  → Found ${pageProjects.length} projects (within ${CRAWLER_CONFIG.HOURS_FILTER}h filter)`);

          if (pageProjects.length === 0) {
            consecutiveEmptyPages++;
            console.log(`  ⚠ Empty page (${consecutiveEmptyPages} consecutive)`);

            // 2페이지 연속 빈 페이지면 중단 (시간 필터로 인한 자연스러운 종료)
            if (consecutiveEmptyPages >= 2) {
              console.log(`  → Stopping: No more recent projects`);
              break;
            }
          } else {
            consecutiveEmptyPages = 0;
            allProjects.push(...pageProjects);
          }

          // 최대 수집 개수 도달 시 중단
          if (allProjects.length >= CRAWLER_CONFIG.MAX_PROJECTS) {
            console.log(`  → Reached max projects limit (${CRAWLER_CONFIG.MAX_PROJECTS})`);
            break;
          }

          pageIndex++;

          // Rate limiting (increased for stability)
          if (pageIndex <= CRAWLER_CONFIG.MAX_PAGES) {
            await sleep(CRAWLER_CONFIG.PAGE_DELAY_MS);
          }
        } catch (pageError: any) {
          console.error(`  ✗ Error fetching page ${pageIndex}: ${pageError.code || pageError.message}`);
          // Continue with collected projects instead of breaking
          console.log(`  → Continuing with ${allProjects.length} projects collected so far`);
          break;
        }
      }

      console.log(`\n=== Pagination complete: ${allProjects.length} projects collected ===`);
    }

    const projects = allProjects;

    // Step 2: Fetch detail pages and extract file URLs
    console.log(`\n=== Step 2: Fetching detail pages for ${projects.length} projects ===`);

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];

      if (project.detailUrl) {
        console.log(`[${i + 1}/${projects.length}] ${project.name}`);

        try {
          const attachmentUrls = await fetchDetailPage(project.detailUrl, url);
          projects[i].attachmentUrls = attachmentUrls;

          if (attachmentUrls.length > 0) {
            console.log(`  ✓ Files found:`);
            attachmentUrls.forEach((fileUrl, idx) => {
              const fileName = fileUrl.split('/').pop() || fileUrl;
              console.log(`    ${idx + 1}. ${fileName}`);
            });
          }
        } catch (error: any) {
          console.error(`  ✗ Error fetching detail page: ${error.code || error.message}`);
        }

        // Add delay to avoid rate limiting (increased for stability)
        await sleep(CRAWLER_CONFIG.DETAIL_DELAY_MS);
      } else {
        console.log(`[${i + 1}/${projects.length}] ${project.name} - No detail URL found`);
      }
    }

    console.log(`\n=== Detail page crawling complete ===`);
    const projectsWithFiles = projects.filter(p => p.attachmentUrls && p.attachmentUrls.length > 0);
    console.log(`Projects with attachments: ${projectsWithFiles.length}/${projects.length}`);

    // NOTE: File processing (Step 3+4) now happens in saveProjects()
    // This allows us to:
    // 1. Save project first to get projectId
    // 2. Upload files to Supabase Storage with proper path
    // 3. Save attachment records linked to project
    // 4. Apply smart parsing only to relevant files

    console.log(`\n=== Returning ${projects.length} projects for processing ===`);
    return projects;
  } catch (error) {
    console.error(`Crawling failed for ${url}:`, error);
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
  console.log(`  → K-Startup parser: Found ${listItems.length} items`);

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

    // 등록일 기반 필터링
    if (uploadDate && !isWithinTimeFilter(uploadDate, hoursFilter)) {
      return; // 시간 필터 밖이면 스킵
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

    const project: CrawledProject = {
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

    projects.push(project);
  });

  return projects;
}

/**
 * Detect site type from URL
 */
function detectSiteType(url: string): 'bizinfo' | 'kstartup' | 'unknown' {
  if (url.includes('bizinfo.go.kr')) return 'bizinfo';
  if (url.includes('k-startup.go.kr')) return 'kstartup';
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
 * Parse HTML content with date filtering (기업마당, K-Startup 등)
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

  // 기업마당 파서 (기본)
  return parseBizinfoHtml($, sourceUrl, hoursFilter);
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
    if (rows.length > 0) {
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

        // 기업마당 테이블 구조: [번호, 분야, 제목, 기간, 지역, 기관유형, 등록일, 조회수]
        cells.each((cellIdx, cell) => {
          const text = $(cell).text().trim();

          // Cell 1: 카테고리 (분야)
          if (cellIdx === 1 && text.length >= 2 && text.length < 20) {
            category = text;
          }

          // Cell 2: 제목 (링크 포함)
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
          }

          // Cell 4: 지역
          if (cellIdx === 4 && text.length >= 2 && text.length < 20) {
            region = text;
          }

          // Cell 5: 기관유형/기관명
          if (cellIdx === 5 && text.length >= 2) {
            organization = text;
          }

          // Cell 6: 등록일 (YYYY-MM-DD 형식)
          if (cellIdx === 6) {
            const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
            if (dateMatch) {
              uploadDate = dateMatch[0];
            }
          }
        });

        // 등록일 기반 필터링
        if (uploadDate && !isWithinTimeFilter(uploadDate, hoursFilter)) {
          return; // 시간 필터 밖이면 스킵
        }

        // Skip if no valid name
        if (!name || name.length < 3 || /^\d+$/.test(name)) {
          return;
        }

        const project: CrawledProject = {
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

        projects.push(project);
      });

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
    const project: CrawledProject = {
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

    projects.push(project);
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

      // Prepare project data (exclude savedAttachments which is not in schema)
      const { savedAttachments: _savedAttachments, attachmentUrls, ...projectData } = project;

      let projectId: string;

      if (existing) {
        // Update existing project
        await prisma.supportProject.update({
          where: { id: existing.id },
          data: {
            ...projectData,
            crawledAt: new Date(),
            updatedAt: new Date(),
          },
        });
        projectId = existing.id;
        updatedCount++;
        console.log(`  ✓ Updated project: ${project.name}`);
      } else {
        // Create new project
        const created = await prisma.supportProject.create({
          data: {
            ...projectData,
            crawledAt: new Date(),
            status: "active",
          },
        });
        projectId = created.id;
        newCount++;
        console.log(`  ✓ Created project: ${project.name}`);
      }

      // Process and save attachments (NEW)
      if (attachmentUrls && attachmentUrls.length > 0) {
        console.log(`  → Processing ${attachmentUrls.length} attachment(s)...`);

        try {
          // 기존 프로젝트 업데이트 시, 기존 attachments 삭제 (중복 방지)
          if (existing) {
            const deletedCount = await prisma.projectAttachment.deleteMany({
              where: { projectId },
            });
            if (deletedCount.count > 0) {
              console.log(`  → Removed ${deletedCount.count} existing attachment(s)`);
            }
          }

          const { attachments, aiAnalysis } = await processProjectFiles(
            projectId,
            attachmentUrls
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

          console.log(`  ✓ Saved ${attachments.length} attachment(s) to DB`);

          // Update project with AI analysis if available
          if (aiAnalysis) {
            // Parse dates if provided
            const parseDate = (dateStr?: string): Date | undefined => {
              if (!dateStr) return undefined;
              const date = new Date(dateStr);
              return isNaN(date.getTime()) ? undefined : date;
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
                deadline: parseDate(aiAnalysis.deadline),
                startDate: parseDate(aiAnalysis.startDate),
                endDate: parseDate(aiAnalysis.endDate),
              },
            });
            console.log(`  ✓ Updated project with AI analysis (summary, description, eligibility, etc.)`);
          }
        } catch (fileError) {
          console.error(`  ✗ Error processing attachments:`, fileError);
        }

        // Rate limiting: 2 seconds between projects with files
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to save project "${project.name}":`, error);
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

  console.log(`Processing ${pendingJobs.length} pending crawl jobs`);

  for (const job of pendingJobs) {
    try {
      await processCrawlJob(job.id);
    } catch (error) {
      console.error(`Failed to process job ${job.id}:`, error);
      // Continue with next job even if one fails
    }
  }
}
