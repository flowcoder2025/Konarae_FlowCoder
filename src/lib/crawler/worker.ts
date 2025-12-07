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

    if (type === "api") {
      // API response parsing (JSON)
      return parseApiResponse(response.data, url);
    } else {
      // Web scraping (HTML)
      const $ = load(response.data);
      return parseHtmlContent($, url);
    }
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

  // 기업마당 예시 (실제 HTML 구조에 맞춰 수정 필요)
  $(".project-item, .support-item, tr").each((_, element) => {
    const $el = $(element);

    // Extract project info from HTML structure
    // This is a generic example - adjust selectors based on actual site structure
    const name =
      $el.find(".project-title, .support-name, td:nth-child(2)").text().trim() ||
      "정보 없음";
    const organization =
      $el.find(".organization, .agency, td:nth-child(3)").text().trim() ||
      "미상";
    const category = $el.find(".category, td:nth-child(4)").text().trim() || "기타";

    // Skip if no valid name
    if (name === "정보 없음" || name.length < 3) {
      return;
    }

    // Build project object
    const project: CrawledProject = {
      externalId: undefined, // Will be extracted from detail page if available
      name,
      organization,
      category,
      target: "중소기업", // Default target
      region: "전국", // Default region
      summary: $el.find(".summary, .description").text().trim() || name,
      sourceUrl,
      isPermanent: false,
    };

    projects.push(project);
  });

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
