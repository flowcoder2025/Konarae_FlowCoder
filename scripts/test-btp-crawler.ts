#!/usr/bin/env npx tsx
/**
 * 부산테크노파크 크롤러 테스트
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import { processCrawlJob } from "../src/lib/crawler/worker";

async function main() {
  console.log("=== 부산테크노파크 크롤러 테스트 ===\n");

  // 부산테크노파크 소스 찾기
  const source = await prisma.crawlSource.findFirst({
    where: { name: { contains: "부산테크노파크" }, isActive: true },
  });

  if (!source) {
    console.error("❌ 부산테크노파크 소스를 찾을 수 없습니다");
    return;
  }

  console.log("🎯 테스트 소스:", source.name);
  console.log("   URL:", source.url);
  console.log("");

  // 테스트용 크롤 잡 생성
  const job = await prisma.crawlJob.create({
    data: {
      sourceId: source.id,
      status: "pending",
    },
  });

  console.log("📝 크롤 잡 생성:", job.id);
  console.log("🚀 크롤링 시작 (테스트 모드: 5개)...\n");

  const startTime = Date.now();

  try {
    process.env.TEST_MAX_PROJECTS = "5";

    const result = await processCrawlJob(job.id);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n✅ 크롤링 완료 (" + duration + "초)");
    console.log("   - 발견:", result.projectsFound + "건");
    console.log("   - 신규:", result.projectsNew + "건");
    console.log("   - 업데이트:", result.projectsUpdated + "건");
    console.log("   - 파일 처리:", result.filesProcessed + "건");

  } catch (error: any) {
    console.error("\n❌ 크롤링 실패:", error.message);
    console.error(error.stack);
  }

  // 최근 처리된 프로젝트 조회
  console.log("\n📋 최근 처리된 프로젝트:");
  const recentProjects = await prisma.supportProject.findMany({
    where: { crawledAt: { gte: new Date(startTime) } },
    select: {
      name: true,
      sourceUrl: true,
      region: true,
      amountMax: true,
      attachments: {
        select: { fileName: true, sourceUrl: true },
      },
    },
    take: 5,
  });

  if (recentProjects.length === 0) {
    console.log("   (새로 크롤링된 프로젝트 없음)");
  } else {
    recentProjects.forEach((p, i) => {
      console.log("\n" + (i + 1) + ". " + p.name.substring(0, 50));
      console.log("   지역:", p.region || "미지정");
      console.log("   금액:", p.amountMax ? Number(p.amountMax).toLocaleString() + "원" : "미정");
      console.log("   첨부파일:", p.attachments.length + "개");
      p.attachments.slice(0, 3).forEach(a => {
        console.log("     - " + a.fileName);
      });
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
