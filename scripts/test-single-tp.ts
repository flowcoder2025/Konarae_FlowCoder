#!/usr/bin/env npx tsx
/**
 * Test single technopark by name
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { processCrawlJob } from "../src/lib/crawler/worker";
import { prisma } from "../src/lib/prisma";

const name = process.argv[2] || "강원테크노파크";

async function main() {
  console.log(`=== ${name} 테스트 ===\n`);

  const source = await prisma.crawlSource.findFirst({
    where: { name: { contains: name.replace("테크노파크", "") } },
  });

  if (!source) {
    console.log(`❌ CrawlSource not found: ${name}`);
    await prisma.$disconnect();
    return;
  }

  console.log(`URL: ${source.url}`);
  console.log(`Type: ${source.type || "technopark"}`);

  // Create a crawl job
  const job = await prisma.crawlJob.create({
    data: {
      sourceId: source.id,
      status: "pending",
    },
  });

  const start = Date.now();
  const result = await processCrawlJob(job.id);
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n=== 결과 (${duration}초) ===`);
  console.log(`Projects found: ${result.projectsFound}`);
  console.log(`New: ${result.projectsNew}`);
  console.log(`Updated: ${result.projectsUpdated}`);
  console.log(`Files: ${result.filesProcessed}`);

  if (result.projectsFound === 0) {
    console.log("\n❌ 0 projects - check parsing logic");
  } else {
    console.log("\n✅ Projects found successfully");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
