/**
 * 기존 공고 데이터 재분류 스크립트
 * - 지역: 제목/기관명에서 추출하여 "전국" → 실제 지역으로 업데이트
 * - 실행: npx tsx scripts/reclassify-projects.ts
 */

import { PrismaClient } from "@prisma/client";
import { extractRegionFromText, VALID_REGIONS } from "../src/lib/crawler/validators";

const prisma = new PrismaClient();

async function reclassifyProjects() {
  console.log("🔄 공고 데이터 재분류 시작...\n");

  // 1. 현재 지역 분포 확인
  console.log("📊 현재 지역 분포:");
  const currentDistribution = await prisma.supportProject.groupBy({
    by: ["region"],
    where: { deletedAt: null },
    _count: true,
    orderBy: { _count: { region: "desc" } },
  });

  currentDistribution.forEach((r) => {
    console.log(`   ${r.region}: ${r._count}개`);
  });
  console.log("");

  // 2. "전국"으로 분류된 공고 조회
  const projectsToCheck = await prisma.supportProject.findMany({
    where: {
      region: "전국",
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      organization: true,
      region: true,
    },
  });

  console.log(`🔍 "전국" 공고 ${projectsToCheck.length}개 검사 중...\n`);

  // 3. 제목/기관명에서 지역 추출
  const updates: { id: string; name: string; organization: string; newRegion: string }[] = [];

  for (const project of projectsToCheck) {
    // 제목에서 추출
    let newRegion = extractRegionFromText(project.name);

    // 제목에서 못 찾으면 기관명에서 추출
    if (!newRegion) {
      newRegion = extractRegionFromText(project.organization);
    }

    // 지역을 찾은 경우 업데이트 목록에 추가
    if (newRegion && newRegion !== "전국") {
      updates.push({
        id: project.id,
        name: project.name,
        organization: project.organization,
        newRegion,
      });
    }
  }

  console.log(`✅ 지역 재분류 가능: ${updates.length}개\n`);

  if (updates.length === 0) {
    console.log("업데이트할 공고가 없습니다.");
    await prisma.$disconnect();
    return;
  }

  // 4. 미리보기 (처음 10개)
  console.log("📝 변경 미리보기 (처음 10개):");
  updates.slice(0, 10).forEach((u) => {
    console.log(`   [${u.newRegion}] ${u.name.slice(0, 40)}...`);
    console.log(`      기관: ${u.organization}`);
  });
  console.log("");

  // 5. 지역별 업데이트 통계
  const regionStats: Record<string, number> = {};
  updates.forEach((u) => {
    regionStats[u.newRegion] = (regionStats[u.newRegion] || 0) + 1;
  });

  console.log("📊 업데이트 예정 지역별 통계:");
  Object.entries(regionStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      console.log(`   ${region}: ${count}개`);
    });
  console.log("");

  // 6. 실제 업데이트 (배치 처리)
  console.log("🔄 DB 업데이트 중...");

  let updated = 0;
  const batchSize = 100;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    await prisma.$transaction(
      batch.map((u) =>
        prisma.supportProject.update({
          where: { id: u.id },
          data: { region: u.newRegion },
        })
      )
    );

    updated += batch.length;
    console.log(`   ${updated}/${updates.length} 완료`);
  }

  console.log(`\n✅ 총 ${updated}개 공고 지역 업데이트 완료!\n`);

  // 7. 업데이트 후 지역 분포 확인
  console.log("📊 업데이트 후 지역 분포:");
  const newDistribution = await prisma.supportProject.groupBy({
    by: ["region"],
    where: { deletedAt: null },
    _count: true,
    orderBy: { _count: { region: "desc" } },
  });

  newDistribution.forEach((r) => {
    console.log(`   ${r.region}: ${r._count}개`);
  });

  await prisma.$disconnect();
}

// 실행
reclassifyProjects().catch((e) => {
  console.error("❌ 오류:", e);
  prisma.$disconnect();
  process.exit(1);
});
