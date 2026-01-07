#!/usr/bin/env npx tsx
/**
 * 테크노파크 소스 URL 수정 스크립트
 * 잘못된 URL을 올바른 URL로 업데이트
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

interface UrlFix {
  name: string;
  oldUrlPattern: string;
  newUrl: string;
}

// 수정이 필요한 URL 목록
const urlFixes: UrlFix[] = [
  {
    name: "강원테크노파크",
    oldUrlPattern: "gwtp.or.kr/sub05/sub01.asp",
    newUrl: "https://www.gwtp.or.kr/gwtp/bbsNew_list.php?code=sub01b&keyvalue=sub01",
  },
  // 경남테크노파크는 SPA 사이트로 변경되어 별도 처리 필요
  // {
  //   name: "경남테크노파크",
  //   oldUrlPattern: "gntp.or.kr",
  //   newUrl: "...", // SPA 사이트라 다른 접근 필요
  // },
];

async function main() {
  console.log("=== 테크노파크 소스 URL 수정 ===\n");

  // 현재 등록된 모든 테크노파크 소스 조회
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

  console.log(`현재 등록된 테크노파크 소스: ${sources.length}개\n`);

  let fixedCount = 0;

  for (const fix of urlFixes) {
    const source = sources.find(
      (s) => s.url.includes(fix.oldUrlPattern) || s.name.includes(fix.name)
    );

    if (source) {
      console.log(`[${fix.name}]`);
      console.log(`  기존 URL: ${source.url}`);
      console.log(`  새 URL: ${fix.newUrl}`);

      // URL 업데이트
      await prisma.crawlSource.update({
        where: { id: source.id },
        data: { url: fix.newUrl },
      });

      console.log(`  ✅ 업데이트 완료\n`);
      fixedCount++;
    } else {
      console.log(`[${fix.name}] - 소스를 찾을 수 없음\n`);
    }
  }

  // 전체 소스 URL 목록 출력
  console.log("\n=== 현재 등록된 전체 테크노파크 소스 ===\n");
  const updatedSources = await prisma.crawlSource.findMany({
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

  updatedSources.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}`);
    console.log(`   ${s.url}\n`);
  });

  console.log(`\n총 ${fixedCount}개 URL 수정 완료`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
