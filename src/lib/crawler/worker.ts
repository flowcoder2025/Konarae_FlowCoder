/**
 * Crawler Worker
 * Background worker for processing crawl jobs
 */

import { prisma } from "@/lib/prisma";

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

    // Save projects to database
    const { newCount, updatedCount } = await saveProjects(crawledProjects);

    console.log(`Saved: ${newCount} new, ${updatedCount} updated`);

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
}

/**
 * Extract file URLs from detail page
 * Finds HWP, HWPX, PDF attachment links
 * Specifically handles 기업마당 (bizinfo.go.kr) HTML structure
 */
function extractFileUrls(
  $: ReturnType<typeof import("cheerio")["load"]>
): string[] {
  const fileUrls: string[] = [];

  // 기업마당 specific pattern: Find "첨부파일" or "본문출력파일" sections
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
 */
async function fetchDetailPage(
  detailUrl: string,
  baseUrl: string
): Promise<string[]> {
  try {
    const axios = (await import("axios")).default;
    const { load } = await import("cheerio");

    console.log(`  → Fetching detail page: ${detailUrl}`);

    const response = await axios.get(detailUrl, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KonaraeBot/1.0; +https://konarae.com)",
      },
    });

    const $ = load(response.data);
    const fileUrls = extractFileUrls($);

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
  } catch (error) {
    console.error(`  ✗ Failed to fetch detail page ${detailUrl}:`, error);
    return [];
  }
}

/**
 * Step 3: Download file from URL
 */
async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const axios = (await import("axios")).default;

    console.log(`    → Downloading file...`);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 seconds for file download
      maxContentLength: 10 * 1024 * 1024, // 10MB limit
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KonaraeBot/1.0; +https://konarae.com)",
      },
    });

    const buffer = Buffer.from(response.data);
    const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`    ✓ Downloaded ${sizeInMB}MB`);

    // Debug: Check first 100 bytes to verify file type
    const preview = buffer.slice(0, 100).toString('utf8', 0, 100);
    if (preview.includes('<!DOCTYPE') || preview.includes('<html')) {
      console.error(`    ✗ Downloaded HTML instead of file!`);
      console.error(`    Preview: ${preview.substring(0, 200)}`);
      return null;
    }

    return buffer;
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
  } catch (error) {
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
  description?: string;
  eligibility?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
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

    const model = google("gemini-1.5-flash");

    const prompt = `다음은 정부 지원사업 공고문입니다. 아래 정보를 JSON 형식으로 추출해주세요:

1. description: 사업의 목적과 개요 (2-3문장, 핵심만)
2. eligibility: 신청 자격 요건 (핵심만, 있는 경우)
3. applicationProcess: 신청 방법 및 절차 (간단히, 있는 경우)
4. evaluationCriteria: 평가 기준 (있는 경우)

응답은 반드시 다음 JSON 형식으로만 작성해주세요:
{
  "description": "...",
  "eligibility": "...",
  "applicationProcess": "...",
  "evaluationCriteria": "..."
}

정보가 없는 항목은 생략하세요.

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
 * Step 3+4: Process files for a project
 */
async function processProjectFiles(
  project: CrawledProject
): Promise<Partial<CrawledProject>> {
  const updates: Partial<CrawledProject> = {};

  // Only process if we have attachment URLs
  if (!project.attachmentUrls || project.attachmentUrls.length === 0) {
    return updates;
  }

  // Process only the first file for now (PDF only in v1)
  const firstFileUrl = project.attachmentUrls[0];

  console.log(`  → Processing file 1/${project.attachmentUrls.length}`);

  // Step 3a: Download file
  const fileBuffer = await downloadFile(firstFileUrl);
  if (!fileBuffer) {
    return updates;
  }

  // Step 3b: Extract text (supports PDF/HWP/HWPX via Railway parsers)
  const text = await extractFileText(fileBuffer);
  if (!text) {
    console.log(`    ⚠ File extraction failed or unsupported format`);
    return updates;
  }

  // Step 4: Analyze with Gemini
  const analysis = await analyzeWithGemini(text);
  if (analysis) {
    Object.assign(updates, analysis);
  }

  return updates;
}

/**
 * Actual crawling implementation
 * Supports both 'web' (HTML scraping) and 'api' (JSON response) types
 */
async function crawlAndParse(
  url: string,
  type: string
): Promise<CrawledProject[]> {
  const axios = (await import("axios")).default;
  const { load } = await import("cheerio");

  try {
    // Fetch data
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KonaraeBot/1.0; +https://konarae.com)",
      },
    });

    let projects: CrawledProject[] = [];

    if (type === "api") {
      // API response parsing (JSON)
      projects = parseApiResponse(response.data, url);
    } else {
      // Web scraping (HTML)
      const $ = load(response.data);
      projects = parseHtmlContent($, url);
    }

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
        } catch (error) {
          console.error(`  ✗ Error fetching detail page:`, error);
        }

        // Add delay to avoid rate limiting (500ms between requests)
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log(`[${i + 1}/${projects.length}] ${project.name} - No detail URL found`);
      }
    }

    console.log(`\n=== Detail page crawling complete ===`);
    const projectsWithFiles = projects.filter(p => p.attachmentUrls && p.attachmentUrls.length > 0);
    console.log(`Projects with attachments: ${projectsWithFiles.length}/${projects.length}`);

    // Step 3+4: Download files and analyze with AI
    console.log(`\n=== Step 3: File download and AI analysis ===`);
    let processedCount = 0;
    let successCount = 0;

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];

      if (project.attachmentUrls && project.attachmentUrls.length > 0) {
        console.log(`[${i + 1}/${projects.length}] ${project.name}`);

        try {
          const updates = await processProjectFiles(project);

          if (Object.keys(updates).length > 0) {
            // Merge updates into project
            Object.assign(projects[i], updates);
            successCount++;
            console.log(`  ✓ AI analysis complete`);
          } else {
            console.log(`  ⚠ No updates from file processing`);
          }

          processedCount++;
        } catch (error) {
          console.error(`  ✗ Error processing files:`, error);
        }

        // Rate limiting: 4 seconds between Gemini API calls
        await new Promise(resolve => setTimeout(resolve, 4000));
      } else {
        console.log(`[${i + 1}/${projects.length}] ${project.name} - No files to process`);
      }
    }

    console.log(`\n=== File processing complete ===`);
    console.log(`Processed: ${processedCount}/${projectsWithFiles.length}`);
    console.log(`Successful AI analysis: ${successCount}/${processedCount}`);

    return projects;
  } catch (error) {
    console.error(`Crawling failed for ${url}:`, error);
    throw new Error(
      `Failed to crawl ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Parse HTML content (기업마당, K-Startup 등)
 */
function parseHtmlContent(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string
): CrawledProject[] {
  const projects: CrawledProject[] = [];

  // Debug: Log HTML structure
  console.log("=== HTML Debug Info ===");
  console.log("Page title:", $("title").text());
  console.log("Total tables:", $("table").length);
  console.log("Total tbody:", $("tbody").length);
  console.log("Total tr:", $("tr").length);
  console.log("Total divs with class:", $("div[class*='list'], div[class*='item'], div[class*='board']").length);

  // Try different selectors for 기업마당
  const selectors = [
    "table.board-list tbody tr",
    "table.table tbody tr",
    ".board-list tbody tr",
    ".list-table tbody tr",
    "tbody tr",
    "tr",
  ];

  let foundRows = 0;
  for (const selector of selectors) {
    const rows = $(selector);
    if (rows.length > 0) {
      console.log(`✓ Found ${rows.length} rows with selector: ${selector}`);
      foundRows = rows.length;

      // Parse each row
      rows.each((idx, element) => {
        if (idx === 0) {
          // Skip header row if exists
          const headerText = $(element).text().toLowerCase();
          if (headerText.includes('번호') || headerText.includes('제목') || headerText.includes('구분')) {
            console.log("Skipping header row");
            return;
          }
        }

        const $row = $(element);

        // Debug first few rows
        if (idx < 3) {
          console.log(`\nRow ${idx}:`);
          console.log("HTML:", $row.html());
          console.log("Cells:", $row.find("td").length);
          $row.find("td").each((cellIdx, cell) => {
            console.log(`  Cell ${cellIdx}:`, $(cell).text().trim().substring(0, 50));
          });
        }

        // Extract data from cells
        const cells = $row.find("td");
        if (cells.length < 2) return; // Skip if not enough cells

        // Try to extract project info from table cells
        let name = "";
        let organization = "";
        let category = "";
        let detailUrl = "";

        // Common patterns for government support sites:
        // [번호, 제목, 기관, 분류, 기간, ...]
        cells.each((cellIdx, cell) => {
          const text = $(cell).text().trim();

          // Title is usually in a link or longest cell
          if ($(cell).find("a").length > 0 && !name) {
            const $link = $(cell).find("a").first();
            name = $link.text().trim();

            // Extract detail page URL
            const href = $link.attr("href");
            if (href) {
              // Handle relative URLs
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

          // Category/organization detection
          if (text.length > 2 && text.length < 30) {
            if (!category && (text.includes("지원") || text.includes("사업") || text.includes("공모"))) {
              category = text;
            }
            if (!organization && (text.includes("부") || text.includes("청") || text.includes("원") || text.includes("공단"))) {
              organization = text;
            }
          }
        });

        // If name is still empty, try the second or third cell
        if (!name && cells.length >= 2) {
          name = $(cells[1]).text().trim();
          if (!name || name.length < 3) {
            name = $(cells[2]).text().trim();
          }
        }

        // Skip if no valid name
        if (!name || name.length < 3 || /^\d+$/.test(name)) {
          return;
        }

        const project: CrawledProject = {
          name,
          organization: organization || "미분류",
          category: category || "지원사업",
          target: "중소기업",
          region: "전국",
          summary: name,
          sourceUrl,
          detailUrl: detailUrl || undefined,
          isPermanent: false,
        };

        projects.push(project);
      });

      // If we found projects, stop trying other selectors
      if (projects.length > 0) {
        break;
      }
    }
  }

  if (foundRows === 0) {
    console.log("⚠️ No table rows found. Trying div-based structure...");

    // Try div-based structure
    $("div[class*='item'], div[class*='list'], article").each((idx, element) => {
      if (idx < 5) {
        console.log(`\nDiv structure ${idx}:`, $(element).attr("class"));
        console.log("Content:", $(element).text().trim().substring(0, 100));
      }
    });
  }

  console.log(`=== Parsing complete: ${projects.length} projects found ===\n`);

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
 */
async function saveProjects(
  projects: CrawledProject[]
): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

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

      if (existing) {
        // Update existing project
        await prisma.supportProject.update({
          where: { id: existing.id },
          data: {
            ...project,
            crawledAt: new Date(),
            updatedAt: new Date(),
          },
        });
        updatedCount++;
      } else {
        // Create new project
        await prisma.supportProject.create({
          data: {
            ...project,
            crawledAt: new Date(),
            status: "active",
          },
        });
        newCount++;
      }
    } catch (error) {
      console.error(`Failed to save project "${project.name}":`, error);
      // Continue with next project
    }
  }

  return { newCount, updatedCount };
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
