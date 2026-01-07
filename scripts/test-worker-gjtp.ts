#!/usr/bin/env npx tsx
/**
 * Test worker with 광주테크노파크
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { executeCrawl } from "../src/lib/crawler/worker";

async function main() {
  console.log("=== 광주테크노파크 Worker Test ===\n");

  const result = await executeCrawl({
    sourceId: "test-gjtp",
    sourceUrl: "https://www.gjtp.or.kr/home/business.cs",
    sourceType: "technopark",
  });

  console.log("\n=== Results ===");
  console.log(`Projects found: ${result.projectsFound}`);
  console.log(`New projects: ${result.projectsNew}`);
  console.log(`Updated projects: ${result.projectsUpdated}`);
  
  if (result.projectsFound === 0) {
    console.log("\n❌ No projects found - check parsing logic");
  } else {
    console.log("\n✅ Projects found successfully");
  }
}

main().catch(console.error);
