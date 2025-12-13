/**
 * Local Crawler Test Script
 * Test crawling for a specific source
 *
 * Usage:
 * tsx scripts/test-crawl-source.ts "한국테크노파크진흥회"
 */

import { prisma } from "../src/lib/prisma";
import { processCrawlJob } from "../src/lib/crawler/worker";

async function main() {
  const sourceName = process.argv[2];

  if (!sourceName) {
    console.error("❌ Usage: tsx scripts/test-crawl-source.ts <source-name>");
    console.error("   Example: tsx scripts/test-crawl-source.ts \"한국테크노파크진흥회\"");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  🧪 Crawler Local Test");
  console.log("=".repeat(60));
  console.log(`  Source: ${sourceName}`);
  console.log("=".repeat(60) + "\n");

  try {
    // 1. Find source
    console.log("📋 Step 1: Finding crawl source...");
    const source = await prisma.crawlSource.findFirst({
      where: {
        name: {
          contains: sourceName,
        },
      },
    });

    if (!source) {
      console.error(`❌ Source not found: ${sourceName}`);
      console.log("\n💡 Available sources:");
      const allSources = await prisma.crawlSource.findMany({
        select: { name: true, url: true, isActive: true },
      });
      allSources.forEach((s) => {
        console.log(`   - ${s.name} (${s.url}) ${s.isActive ? "✅" : "❌"}`);
      });
      process.exit(1);
    }

    console.log(`✅ Found: ${source.name}`);
    console.log(`   URL: ${source.url}`);
    console.log(`   Type: ${source.type}`);
    console.log(`   Active: ${source.isActive ? "✅" : "❌"}`);

    if (!source.isActive) {
      console.log("\n⚠️  Source is inactive. Activating for test...");
      await prisma.crawlSource.update({
        where: { id: source.id },
        data: { isActive: true },
      });
    }

    // 2. Create crawl job
    console.log("\n📋 Step 2: Creating crawl job...");
    const job = await prisma.crawlJob.create({
      data: {
        sourceId: source.id,
        status: "pending",
      },
    });

    console.log(`✅ Job created: ${job.id}`);

    // 3. Update source lastCrawled
    await prisma.crawlSource.update({
      where: { id: source.id },
      data: { lastCrawled: new Date() },
    });

    // 4. Process job (샘플 5개로 제한)
    console.log("\n📋 Step 3: Starting crawl (샘플 5개)...");
    console.log("=".repeat(60) + "\n");

    // Set environment variable to limit to 5 projects
    process.env.TEST_MAX_PROJECTS = "5";

    const startTime = Date.now();
    const stats = await processCrawlJob(job.id);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 5. Show results
    console.log("\n" + "=".repeat(60));
    console.log("  ✅ Crawl Complete!");
    console.log("=".repeat(60));
    console.log(`  Duration: ${duration}s`);
    console.log(`  Projects Found: ${stats.projectsFound}`);
    console.log(`  Projects New: ${stats.projectsNew}`);
    console.log(`  Projects Updated: ${stats.projectsUpdated}`);
    console.log(`  Files Processed: ${stats.filesProcessed}`);
    console.log("=".repeat(60) + "\n");

    // 6. Show sample projects
    if (stats.projectsFound > 0) {
      console.log("📋 Sample Projects:");
      const projects = await prisma.supportProject.findMany({
        where: {
          sourceUrl: source.url,
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          name: true,
          summary: true,
          fundingSummary: true,
          deadline: true,
          attachments: {
            select: {
              fileName: true,
              fileSize: true,
            },
          },
        },
      });

      projects.forEach((project, idx) => {
        console.log(`\n${idx + 1}. ${project.name}`);
        if (project.summary) {
          console.log(`   Summary: ${project.summary.substring(0, 100)}...`);
        }
        if (project.fundingSummary) {
          console.log(`   Funding: ${project.fundingSummary}`);
        }
        if (project.deadline) {
          console.log(`   Deadline: ${project.deadline.toISOString().split("T")[0]}`);
        }
        if (project.attachments.length > 0) {
          console.log(`   Attachments: ${project.attachments.length} files`);
          project.attachments.slice(0, 2).forEach((att) => {
            const size = att.fileSize ? `${(att.fileSize / 1024).toFixed(1)}KB` : "N/A";
            console.log(`     - ${att.fileName} (${size})`);
          });
        }
      });
    }

    console.log("\n✅ Test completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
