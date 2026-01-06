#!/usr/bin/env npx tsx
/**
 * Crawler Test Script
 * 크롤러 개선 효과 테스트
 *
 * Usage: npx tsx scripts/test-crawler.ts
 */

import { prisma } from "../src/lib/prisma";
import { processCrawlJob } from "../src/lib/crawler/worker";

async function main() {
  console.log("=== 크롤러 개선 효과 테스트 ===\n");

  // 기존 통계 조회
  const beforeStats = await getStats();
  console.log("📊 테스트 전 통계:");
  console.log(`   - 전체 프로젝트: ${beforeStats.totalProjects}건`);
  console.log(`   - 금액 정보 있음: ${beforeStats.withAmount}건 (${beforeStats.amountRate}%)`);
  console.log(`   - 파싱 성공률: ${beforeStats.parseSuccessRate}%`);
  console.log("");

  // 기업마당 소스 찾기
  const source = await prisma.crawlSource.findFirst({
    where: { name: { contains: "기업마당" }, isActive: true },
  });

  if (!source) {
    console.error("❌ 기업마당 소스를 찾을 수 없습니다");
    return;
  }

  console.log(`🎯 테스트 소스: ${source.name}`);
  console.log(`   URL: ${source.url}\n`);

  // 테스트용 크롤 잡 생성
  const job = await prisma.crawlJob.create({
    data: {
      sourceId: source.id,
      status: "pending",
    },
  });

  console.log(`📝 크롤 잡 생성: ${job.id}\n`);
  console.log("🚀 크롤링 시작 (테스트 모드: 5개 프로젝트)...\n");

  const startTime = Date.now();

  try {
    // 테스트 모드로 실행 (환경변수로 제한)
    process.env.TEST_MAX_PROJECTS = "5";

    const result = await processCrawlJob(job.id);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ 크롤링 완료 (${duration}초)`);
    console.log(`   - 발견: ${result.projectsFound}건`);
    console.log(`   - 신규: ${result.projectsNew}건`);
    console.log(`   - 업데이트: ${result.projectsUpdated}건`);
    console.log(`   - 파일 처리: ${result.filesProcessed}건`);

  } catch (error: any) {
    console.error(`\n❌ 크롤링 실패: ${error.message}`);
  }

  // 개선 효과 확인: 최근 처리된 프로젝트 조회
  console.log("\n📋 최근 처리된 프로젝트 상세:");
  const recentProjects = await prisma.supportProject.findMany({
    where: { crawledAt: { gte: new Date(startTime) } },
    select: {
      name: true,
      amountMax: true,
      amountDescription: true,
      description: true,
      eligibility: true,
      attachments: {
        select: {
          fileName: true,
          isParsed: true,
          parseError: true,
        },
      },
    },
    take: 5,
  });

  recentProjects.forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.name.substring(0, 40)}...`);
    console.log(`   금액: ${p.amountMax ? `${Number(p.amountMax).toLocaleString()}원` : "미정"}`);
    console.log(`   금액설명: ${p.amountDescription?.substring(0, 30) || "없음"}`);
    console.log(`   설명: ${p.description ? "있음" : "없음"} | 자격요건: ${p.eligibility ? "있음" : "없음"}`);
    console.log(`   첨부파일: ${p.attachments.length}개`);
    p.attachments.forEach(a => {
      const status = a.isParsed ? "✅" : a.parseError ? `❌ ${a.parseError}` : "⏳";
      console.log(`     - ${a.fileName}: ${status}`);
    });
  });

  // 테스트 후 통계
  const afterStats = await getStats();
  console.log("\n📊 테스트 후 통계:");
  console.log(`   - 전체 프로젝트: ${afterStats.totalProjects}건`);
  console.log(`   - 금액 정보 있음: ${afterStats.withAmount}건 (${afterStats.amountRate}%)`);
  console.log(`   - 파싱 성공률: ${afterStats.parseSuccessRate}%`);
}

async function getStats() {
  const totalProjects = await prisma.supportProject.count();
  const withAmount = await prisma.supportProject.count({ where: { amountMax: { not: null } } });

  const totalAttachments = await prisma.projectAttachment.count({ where: { shouldParse: true } });
  const parsedAttachments = await prisma.projectAttachment.count({ where: { isParsed: true } });

  return {
    totalProjects,
    withAmount,
    amountRate: ((withAmount / totalProjects) * 100).toFixed(1),
    parseSuccessRate: totalAttachments > 0 ? ((parsedAttachments / totalAttachments) * 100).toFixed(1) : "0",
  };
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
