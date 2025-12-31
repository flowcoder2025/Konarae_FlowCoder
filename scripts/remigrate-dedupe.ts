/**
 * 중복 검사 재실행 스크립트
 * 기존 그룹을 해제하고 새 알고리즘(지역 필터링 포함)으로 재실행
 *
 * 실행: set -a && source .env.local && set +a && npx tsx scripts/remigrate-dedupe.ts
 */

import { prisma } from "@/lib/prisma";
import {
  updateNormalizedFields,
  groupExistingProjects,
} from "@/lib/deduplication";

async function main() {
  console.log("=".repeat(60));
  console.log("중복 검사 재실행 (지역 필터링 적용)");
  console.log("=".repeat(60));

  const startTime = Date.now();

  // Step 0: 기존 그룹 해제
  console.log("\n[Step 0] 기존 그룹 해제...");

  // 모든 프로젝트의 그룹 연결 해제
  const unlinked = await prisma.supportProject.updateMany({
    where: { groupId: { not: null } },
    data: {
      groupId: null,
      isCanonical: false,
    },
  });
  console.log(`  프로젝트 그룹 해제: ${unlinked.count}개`);

  // 모든 그룹 삭제
  const deleted = await prisma.projectGroup.deleteMany({});
  console.log(`  그룹 삭제: ${deleted.count}개`);

  // Step 1: 정규화 필드 업데이트 (이미 되어있으면 스킵)
  console.log("\n[Step 1] 정규화 필드 확인...");
  let totalNormalized = 0;
  let remaining = 1;

  while (remaining > 0) {
    const result = await updateNormalizedFields(100);
    totalNormalized += result.processed;
    remaining = result.remaining;

    if (result.processed > 0) {
      console.log(
        `  처리: ${result.processed}개, 남은 프로젝트: ${remaining}개`
      );
    }
  }

  if (totalNormalized > 0) {
    console.log(`✓ 정규화 완료: 총 ${totalNormalized}개 프로젝트`);
  } else {
    console.log(`✓ 정규화 필드 이미 최신 상태`);
  }

  // Step 2: 새 알고리즘으로 중복 그룹화
  console.log("\n[Step 2] 중복 그룹화 (지역 필터링 적용)...");
  let totalGrouped = 0;
  let totalGroupsCreated = 0;
  let batchCount = 0;

  let hasMore = true;
  while (hasMore) {
    const result = await groupExistingProjects(50);
    totalGrouped += result.projectsGrouped;
    totalGroupsCreated += result.groupsCreated;
    batchCount++;

    if (result.processed > 0) {
      console.log(
        `  배치 ${batchCount}: ${result.processed}개 처리, 그룹 ${result.groupsCreated}개 생성`
      );
    }

    hasMore = result.processed > 0;
  }

  console.log(
    `✓ 그룹화 완료: ${totalGrouped}개 프로젝트 → ${totalGroupsCreated}개 그룹`
  );

  // 통계 출력
  console.log("\n" + "=".repeat(60));
  console.log("[최종 통계]");
  console.log("=".repeat(60));

  const totalProjects = await prisma.supportProject.count({
    where: { deletedAt: null },
  });

  const groupedProjects = await prisma.supportProject.count({
    where: { groupId: { not: null }, deletedAt: null },
  });

  const canonicalProjects = await prisma.supportProject.count({
    where: { isCanonical: true, deletedAt: null },
  });

  const totalGroups = await prisma.projectGroup.count();

  const reviewPending = await prisma.projectGroup.count({
    where: { reviewStatus: "pending_review" },
  });

  const autoMerged = await prisma.projectGroup.count({
    where: { reviewStatus: "auto_merged" },
  });

  const confirmed = await prisma.projectGroup.count({
    where: { reviewStatus: "confirmed" },
  });

  console.log(`\n📊 프로젝트 현황`);
  console.log(`  전체 프로젝트: ${totalProjects}개`);
  console.log(`  그룹화된 프로젝트: ${groupedProjects}개`);
  console.log(`  Canonical (표시용): ${canonicalProjects}개`);

  console.log(`\n📁 그룹 현황`);
  console.log(`  전체 그룹: ${totalGroups}개`);
  console.log(`  자동 병합: ${autoMerged}개`);
  console.log(`  검토 필요: ${reviewPending}개`);
  console.log(`  확정됨: ${confirmed}개`);

  // 중복 제거 효과
  const duplicatesRemoved = totalProjects - canonicalProjects;
  const reductionRate =
    totalProjects > 0
      ? ((duplicatesRemoved / totalProjects) * 100).toFixed(1)
      : 0;

  console.log(`\n🎯 중복 제거 효과`);
  console.log(`  제거된 중복: ${duplicatesRemoved}개 (${reductionRate}%)`);
  console.log(`  최종 표시 프로젝트: ${canonicalProjects}개`);

  // 지역별 그룹 분포 (샘플)
  console.log(`\n🗺️ 지역별 그룹 분포 (상위 10개)`);
  const regionGroups = await prisma.$queryRaw<
    { region: string; count: bigint }[]
  >`
    SELECT pg.region, COUNT(*) as count
    FROM "project_groups" pg
    GROUP BY pg.region
    ORDER BY count DESC
    LIMIT 10
  `;

  for (const r of regionGroups) {
    console.log(`  ${r.region}: ${r.count}개 그룹`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ 완료 (${elapsed}초 소요)`);
  console.log("=".repeat(60));
}

main()
  .catch((error) => {
    console.error("재실행 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
