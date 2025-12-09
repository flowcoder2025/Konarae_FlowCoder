/**
 * Full Crawl Pipeline Test
 * K-Startup 크롤링 → 상세페이지 → 첨부파일 → AI 분석 전체 테스트
 */

// dotenv must be loaded BEFORE any other imports
require("dotenv").config({ path: ".env.local" });

// Verify env vars are loaded
console.log("ENV Check:");
console.log("  SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓" : "✗");
console.log("  SUPABASE_KEY:", process.env.SUPABASE_SERVICE_KEY ? "✓" : "✗");
console.log("  GOOGLE_AI_KEY:", process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "✓" : "✗");
console.log("  DATABASE_URL:", process.env.DATABASE_URL ? "✓" : "✗");

async function main() {
  // Dynamic imports after env is loaded
  const { prisma } = await import("../src/lib/prisma");
  const { processCrawlJob } = await import("../src/lib/crawler/worker");

  console.log("\n" + "=".repeat(60));
  console.log("🚀 Full Crawl Pipeline Test - K-Startup");
  console.log("=".repeat(60));

  try {
    // 1. Find K-Startup crawl source
    console.log("\n[Step 1] Finding K-Startup crawl source...");
    const source = await prisma.crawlSource.findFirst({
      where: {
        name: { contains: "K-Startup" },
        isActive: true,
      },
    });

    if (!source) {
      console.error("❌ K-Startup source not found!");
      console.log("\nAvailable sources:");
      const sources = await prisma.crawlSource.findMany({
        where: { isActive: true },
        select: { id: true, name: true, url: true },
      });
      sources.forEach((s) => console.log(`  - ${s.name}: ${s.url}`));
      return;
    }

    console.log(`✅ Found source: ${source.name}`);
    console.log(`   URL: ${source.url}`);
    console.log(`   Type: ${source.type}`);

    // 2. Create crawl job
    console.log("\n[Step 2] Creating crawl job...");
    const job = await prisma.crawlJob.create({
      data: {
        sourceId: source.id,
        status: "pending",
      },
    });
    console.log(`✅ Created job: ${job.id}`);

    // 3. Execute crawl job (this runs the full pipeline)
    console.log("\n[Step 3] Executing crawl job...");
    console.log("This includes:");
    console.log("  - Page crawling with pagination");
    console.log("  - Detail page fetching");
    console.log("  - Attachment download & parsing");
    console.log("  - AI analysis with Gemini");
    console.log("\n" + "-".repeat(60));

    const startTime = Date.now();
    const stats = await processCrawlJob(job.id);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "-".repeat(60));
    console.log("\n[Step 4] Results Summary");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Projects found: ${stats.projectsFound}`);
    console.log(`✨ New projects: ${stats.projectsNew}`);
    console.log(`🔄 Updated projects: ${stats.projectsUpdated}`);
    console.log(`📎 Files processed: ${stats.filesProcessed}`);

    // 4. Check saved projects with AI analysis
    console.log("\n[Step 5] Checking saved projects with AI analysis...");
    const projectsWithAI = await prisma.supportProject.findMany({
      where: {
        sourceUrl: { contains: "k-startup" },
        description: { not: null },
      },
      orderBy: { crawledAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        description: true,
        eligibility: true,
        fundingSummary: true,
        deadline: true,
        attachments: {
          select: {
            fileName: true,
            fileType: true,
            isParsed: true,
            parsedContent: true,
          },
        },
      },
    });

    if (projectsWithAI.length > 0) {
      console.log(`\n✅ Found ${projectsWithAI.length} projects with AI analysis:\n`);
      projectsWithAI.forEach((p, i) => {
        console.log(`[${i + 1}] ${p.name}`);
        console.log(`    Organization: ${p.organization}`);
        console.log(`    Category: ${p.category}`);
        console.log(`    Deadline: ${p.deadline?.toISOString().split("T")[0] || "N/A"}`);
        console.log(`    Funding: ${p.fundingSummary || "N/A"}`);
        console.log(`    Description: ${p.description?.substring(0, 100)}...`);
        console.log(`    Eligibility: ${p.eligibility?.substring(0, 100) || "N/A"}...`);
        console.log(`    Attachments: ${p.attachments.length}`);
        p.attachments.forEach((a) => {
          console.log(`      - ${a.fileName} (${a.fileType}) - Parsed: ${a.isParsed}`);
        });
        console.log();
      });
    } else {
      console.log("\n⚠️ No projects with AI analysis found yet.");
      console.log("   This may happen if:");
      console.log("   - No attachments were found on detail pages");
      console.log("   - Files couldn't be parsed");
      console.log("   - GOOGLE_GENERATIVE_AI_API_KEY is not set");
    }

    // 5. Check recent attachments
    console.log("\n[Step 6] Recent attachments processed...");
    const recentAttachments = await prisma.projectAttachment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: {
          select: { name: true },
        },
      },
    });

    if (recentAttachments.length > 0) {
      console.log(`\n📎 Recent ${recentAttachments.length} attachments:\n`);
      recentAttachments.forEach((a, i) => {
        console.log(`[${i + 1}] ${a.fileName}`);
        console.log(`    Project: ${a.project.name}`);
        console.log(`    Type: ${a.fileType}`);
        console.log(`    Size: ${(a.fileSize / 1024).toFixed(1)}KB`);
        console.log(`    Parsed: ${a.isParsed}`);
        console.log(`    Storage: ${a.storagePath || "(URL only)"}`);
        if (a.parsedContent) {
          console.log(`    Content: ${a.parsedContent.substring(0, 100)}...`);
        }
        if (a.parseError) {
          console.log(`    Error: ${a.parseError}`);
        }
        console.log();
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Full pipeline test completed!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    const { prisma: p } = await import("../src/lib/prisma");
    await p.$disconnect();
  }
}

main();
