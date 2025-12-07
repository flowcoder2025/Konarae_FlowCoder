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
 */
function extractFileUrls(
  $: ReturnType<typeof import("cheerio")["load"]>
): string[] {
  const fileUrls: string[] = [];
  const extensions = [".hwp", ".hwpx", ".pdf"];

  // Look for download links in common patterns
  const selectors = [
    'a[href*=".hwp"]',
    'a[href*=".hwpx"]',
    'a[href*=".pdf"]',
    'a[href*="download"]',
    'a[href*="file"]',
    'a[href*="attach"]',
    '.file a',
    '.attachment a',
    '.download a',
  ];

  selectors.forEach((selector) => {
    $(selector).each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        // Check if it's a file we want
        const hasValidExt = extensions.some((ext) => href.toLowerCase().includes(ext));
        if (hasValidExt && !fileUrls.includes(href)) {
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
