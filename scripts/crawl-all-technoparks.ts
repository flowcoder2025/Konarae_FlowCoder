#!/usr/bin/env npx tsx
/**
 * 전체 테크노파크 크롤링 실행
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import { processCrawlJob } from "../src/lib/crawler/worker";

interface CrawlResult {
  name: string;
  url: string;
  status: "success" | "error";
  projectsFound: number;
  projectsNew: number;
  filesProcessed: number;
  duration: number;
  error?: string;
}

async function main() {
  console.log("=== 전체 테크노파크 크롤링 ===\n");

  // 모든 테크노파크 소스 조회
  const sources = await prisma.crawlSource.findMany({
    where: {
      isActive: true,
      OR: [
        { url: { contains: "technopark.kr" } },
        { url: { contains: "tp.or.kr" } },
        { url: { contains: "tpi.or.kr" } },
      ],
    },
    orderBy: { name: "asc" },
  });

  console.log(`📋 크롤링 대상: ${sources.length}개 테크노파크\n`);
  sources.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.name}`);
  });
  console.log("");

  const results: CrawlResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const progress = `[${i + 1}/${sources.length}]`;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`${progress} 🚀 ${source.name}`);
    console.log(`    URL: ${source.url}`);

    const jobStartTime = Date.now();

    try {
      // 크롤 잡 생성
      const job = await prisma.crawlJob.create({
        data: {
          sourceId: source.id,
          status: "pending",
        },
      });

      // 테스트 모드: 소스당 최대 10개 프로젝트
      process.env.TEST_MAX_PROJECTS = "10";

      const result = await processCrawlJob(job.id);
      const duration = (Date.now() - jobStartTime) / 1000;

      results.push({
        name: source.name,
        url: source.url,
        status: "success",
        projectsFound: result.projectsFound,
        projectsNew: result.projectsNew,
        filesProcessed: result.filesProcessed,
        duration,
      });

      console.log(`    ✅ 완료 (${duration.toFixed(1)}초)`);
      console.log(`       발견: ${result.projectsFound}건, 신규: ${result.projectsNew}건, 파일: ${result.filesProcessed}개`);

    } catch (error: any) {
      const duration = (Date.now() - jobStartTime) / 1000;

      results.push({
        name: source.name,
        url: source.url,
        status: "error",
        projectsFound: 0,
        projectsNew: 0,
        filesProcessed: 0,
        duration,
        error: error.message,
      });

      console.log(`    ❌ 실패 (${duration.toFixed(1)}초)`);
      console.log(`       에러: ${error.message.substring(0, 100)}`);
    }

    // Rate limiting: 1초 대기
    if (i < sources.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // 최종 결과 요약
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 전체 크롤링 결과 요약");
  console.log(`${"=".repeat(60)}\n`);

  const successful = results.filter(r => r.status === "success");
  const failed = results.filter(r => r.status === "error");

  console.log(`⏱️  총 소요 시간: ${totalDuration}분`);
  console.log(`✅ 성공: ${successful.length}개`);
  console.log(`❌ 실패: ${failed.length}개\n`);

  // 성공 결과 테이블
  if (successful.length > 0) {
    console.log("📋 성공한 크롤링:");
    console.log("-".repeat(80));
    console.log("테크노파크".padEnd(20) + "발견".padStart(8) + "신규".padStart(8) + "파일".padStart(8) + "시간".padStart(10));
    console.log("-".repeat(80));

    let totalFound = 0, totalNew = 0, totalFiles = 0;

    successful.forEach(r => {
      totalFound += r.projectsFound;
      totalNew += r.projectsNew;
      totalFiles += r.filesProcessed;

      const name = r.name.length > 18 ? r.name.substring(0, 18) + ".." : r.name;
      console.log(
        name.padEnd(20) +
        String(r.projectsFound).padStart(8) +
        String(r.projectsNew).padStart(8) +
        String(r.filesProcessed).padStart(8) +
        `${r.duration.toFixed(1)}초`.padStart(10)
      );
    });

    console.log("-".repeat(80));
    console.log(
      "합계".padEnd(20) +
      String(totalFound).padStart(8) +
      String(totalNew).padStart(8) +
      String(totalFiles).padStart(8)
    );
    console.log("");
  }

  // 실패 결과
  if (failed.length > 0) {
    console.log("❌ 실패한 크롤링:");
    failed.forEach(r => {
      console.log(`   - ${r.name}: ${r.error?.substring(0, 60)}`);
    });
    console.log("");
  }

  // 최근 크롤링된 프로젝트 샘플
  console.log("📝 최근 크롤링된 프로젝트 (최대 10개):");
  const recentProjects = await prisma.supportProject.findMany({
    where: { crawledAt: { gte: new Date(startTime) } },
    select: {
      name: true,
      region: true,
      source: { select: { name: true } },
      attachments: { select: { fileName: true } },
    },
    orderBy: { crawledAt: "desc" },
    take: 10,
  });

  if (recentProjects.length === 0) {
    console.log("   (새로 크롤링된 프로젝트 없음)");
  } else {
    recentProjects.forEach((p, i) => {
      const title = p.name.length > 50 ? p.name.substring(0, 50) + "..." : p.name;
      console.log(`\n   ${i + 1}. ${title}`);
      console.log(`      소스: ${p.source.name} | 지역: ${p.region || "미지정"}`);
      if (p.attachments.length > 0) {
        console.log(`      첨부: ${p.attachments.length}개 - ${p.attachments[0].fileName}`);
      }
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
