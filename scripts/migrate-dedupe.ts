/**
 * 기존 프로젝트 중복 감지 마이그레이션 스크립트
 *
 * 실행 방법:
 * 1. 환경변수 로드
 * 2. npx tsx scripts/migrate-dedupe.ts
 *
 * 또는:
 * set -a && source .env.local && set +a && npx tsx scripts/migrate-dedupe.ts
 */

import { prisma } from "@/lib/prisma";
import {
  updateNormalizedFields,
  groupExistingProjects,
} from "@/lib/deduplication";

async function main() {
  console.log("=".repeat(60));
  console.log("프로젝트 중복 감지 마이그레이션 시작");
  console.log("=".repeat(60));

  const startTime = Date.now();

  // Step 1: 정규화 필드 업데이트
  console.log("\n[Step 1] 정규화 필드 업데이트...");
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

  console.log(`✓ 정규화 완료: 총 ${totalNormalized}개 프로젝트`);

  // Step 2: 중복 그룹화
  console.log("\n[Step 2] 중복 그룹화 시작...");
  let totalGrouped = 0;
  let totalGroupsCreated = 0;

  // 그룹이 없는 프로젝트가 있는 동안 계속 처리
  let hasMore = true;
  while (hasMore) {
    const result = await groupExistingProjects(50);
    totalGrouped += result.projectsGrouped;
    totalGroupsCreated += result.groupsCreated;

    if (result.processed > 0) {
      console.log(
        `  처리: ${result.processed}개, 그룹 생성: ${result.groupsCreated}개`
      );
    }

    // 더 이상 처리할 프로젝트가 없으면 종료
    hasMore = result.processed > 0;
  }

  console.log(
    `✓ 그룹화 완료: ${totalGrouped}개 프로젝트 → ${totalGroupsCreated}개 그룹`
  );

  // 통계 출력
  console.log("\n[통계]");

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

  console.log(`  전체 프로젝트: ${totalProjects}개`);
  console.log(`  그룹화된 프로젝트: ${groupedProjects}개`);
  console.log(`  Canonical 프로젝트: ${canonicalProjects}개`);
  console.log(`  전체 그룹: ${totalGroups}개`);
  console.log(`  검토 필요 그룹: ${reviewPending}개`);

  // 중복 제거 효과
  const duplicatesRemoved = totalProjects - canonicalProjects;
  const reductionRate =
    totalProjects > 0
      ? ((duplicatesRemoved / totalProjects) * 100).toFixed(1)
      : 0;

  console.log(`\n[중복 제거 효과]`);
  console.log(`  제거된 중복: ${duplicatesRemoved}개 (${reductionRate}%)`);
  console.log(`  표시될 프로젝트: ${canonicalProjects}개`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n완료 (${elapsed}초 소요)`);
  console.log("=".repeat(60));
}

main()
  .catch((error) => {
    console.error("마이그레이션 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
