#!/usr/bin/env npx tsx
/**
 * Test selected technoparks
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { startCrawlJob } from "../src/lib/crawler/worker";
import { prisma } from "../src/lib/prisma";

const TECHNOPARKS = [
  { name: "광주테크노파크", url: "https://www.gjtp.or.kr/home/business.cs" },
  { name: "경북테크노파크", url: "https://www.gbtp.or.kr/user/board.do?bbsId=BBSMSTR_000000000021" },
  { name: "대전테크노파크", url: "https://www.djtp.or.kr/menu.es?mid=a20100000000" },
];

async function main() {
  console.log("=== Selected Technopark Test ===\n");

  for (const { name, url } of TECHNOPARKS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[${name}]`);
    console.log(`URL: ${url}`);
    console.log("=".repeat(60));

    try {
      // Create temp source
      const source = await prisma.crawlSource.upsert({
        where: { sourceUrl: url },
        update: {},
        create: {
          name,
          sourceUrl: url,
          sourceType: "technopark",
          isActive: true,
        },
      });

      const start = Date.now();
      const result = await startCrawlJob(source.id);
      const duration = ((Date.now() - start) / 1000).toFixed(1);

      console.log(`\n✅ 완료 (${duration}초)`);
      console.log(`   발견: ${result.projectsFound}건`);
      console.log(`   신규: ${result.projectsNew}건`);
      console.log(`   파일: ${result.filesProcessed}개`);
    } catch (e: any) {
      console.log(`\n❌ 에러: ${e.message}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
