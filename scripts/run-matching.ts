/**
 * Run matching for all companies
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/run-matching.ts
 */

import { prisma } from "../src/lib/prisma";
import { executeMatching, storeMatchingResults, type MatchingResultData } from "../src/lib/matching";

async function runMatching() {
  console.log("🚀 기업 매칭 실행 시작...\n");

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      members: {
        where: { role: "owner" },
        select: { userId: true },
        take: 1,
      },
    },
  });

  console.log(`📋 ${companies.length}개 회사 발견\n`);

  for (const company of companies) {
    console.log(`\n[${company.name}] 매칭 시작...`);
    console.log(`   ID: ${company.id}`);

    let userId = company.members[0]?.userId;
    
    if (!userId) {
      const firstUser = await prisma.user.findFirst({ select: { id: true } });
      userId = firstUser?.id || "";
    }

    if (!userId) {
      console.log(`   ⚠️ 사용자 없음 - 스킵`);
      continue;
    }

    try {
      const results: MatchingResultData[] = await executeMatching({
        companyId: company.id,
        userId,
      });

      console.log(`   📊 ${results.length}개 지원사업 매칭됨`);

      const top10 = results.slice(0, 10);
      console.log(`   🏆 상위 10개:`);
      for (let i = 0; i < top10.length; i++) {
        const r = top10[i];
        console.log(`      ${i + 1}. [${r.totalScore}점] ${r.project.name.slice(0, 40)}...`);
        console.log(`         사업유사도: ${r.businessSimilarityScore}, 업종: ${r.categoryScore}, 자격: ${r.eligibilityScore}`);
      }

      await storeMatchingResults(userId, company.id, results);
      console.log(`   ✅ 저장 완료 (상위 50개)`);

    } catch (error) {
      console.error(`   ❌ 에러:`, error);
    }
  }

  console.log("\n\n✅ 전체 매칭 완료!");
}

runMatching()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
