/**
 * Check and clean SupportProject category/region data
 *
 * This script:
 * 1. Lists all distinct category and region values
 * 2. Identifies misplaced data
 * 3. Provides cleanup SQL
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Expected valid values
const VALID_CATEGORIES = [
  "인력",
  "수출",
  "창업",
  "기술",
  "자금",
  "판로",
  "경영",
  "R&D",
  "행사·네트워크",
  "글로벌",
  "사업화",
  "멘토링·컨설팅",
  "기타",
];

const VALID_REGIONS = [
  "전국",
  "서울",
  "경기",
  "인천",
  "강원",
  "충북",
  "충남",
  "대전",
  "세종",
  "전북",
  "전남",
  "광주",
  "경북",
  "경남",
  "대구",
  "울산",
  "부산",
  "제주",
  "경상북도",
  "경상남도",
  "전라북도",
  "전라남도",
  "충청북도",
  "충청남도",
  "강원도",
];

async function checkData() {
  console.log("🔍 SupportProject 데이터 확인 중...\n");

  // Get all distinct categories
  const categories = await prisma.supportProject.groupBy({
    by: ["category"],
    where: {
      deletedAt: null,
      status: "active",
    },
    _count: true,
    orderBy: {
      _count: {
        category: "desc",
      },
    },
  });

  // Get all distinct regions
  const regions = await prisma.supportProject.groupBy({
    by: ["region"],
    where: {
      deletedAt: null,
      status: "active",
    },
    _count: true,
    orderBy: {
      _count: {
        region: "desc",
      },
    },
  });

  console.log("📊 Category 값들 (빈도순):");
  console.log("━".repeat(50));
  categories.forEach((cat) => {
    const isValid = VALID_CATEGORIES.includes(cat.category);
    const icon = isValid ? "✅" : "❌";
    console.log(`${icon} ${cat.category.padEnd(20)} (${cat._count})`);
  });

  console.log("\n📍 Region 값들 (빈도순):");
  console.log("━".repeat(50));
  regions.forEach((region) => {
    const isValid = VALID_REGIONS.includes(region.region);
    const icon = isValid ? "✅" : "❌";
    console.log(`${icon} ${region.region.padEnd(20)} (${region._count})`);
  });

  // Identify misplaced data
  const invalidCategories = categories.filter(
    (c) => !VALID_CATEGORIES.includes(c.category)
  );
  const invalidRegions = regions.filter(
    (r) => !VALID_REGIONS.includes(r.region)
  );

  if (invalidCategories.length > 0 || invalidRegions.length > 0) {
    console.log("\n⚠️  잘못된 데이터 발견:");
    console.log("━".repeat(50));

    if (invalidCategories.length > 0) {
      console.log("\n❌ Category에 들어가면 안 되는 값들:");
      invalidCategories.forEach((cat) => {
        // Check if it's a region name
        const isRegion = VALID_REGIONS.includes(cat.category);
        const suggestion = isRegion ? " → Region으로 이동 필요" : " → 수동 확인 필요";
        console.log(`   "${cat.category}" (${cat._count}개)${suggestion}`);
      });
    }

    if (invalidRegions.length > 0) {
      console.log("\n❌ Region에 들어가면 안 되는 값들:");
      invalidRegions.forEach((region) => {
        // Check if it looks like a date
        const isDate = /^\d{4}\.\d{2}\.\d{2}/.test(region.region);
        const isCategory = VALID_CATEGORIES.includes(region.region);
        let suggestion = " → 수동 확인 필요";
        if (isDate) suggestion = " → 날짜 데이터 (삭제 필요)";
        if (isCategory) suggestion = " → Category로 이동 필요";
        console.log(`   "${region.region}" (${region._count}개)${suggestion}`);
      });
    }

    console.log("\n💡 데이터 정리가 필요합니다.");
    console.log("   다음 명령으로 정리 스크립트를 실행하세요:");
    console.log("   npx tsx scripts/clean-project-data.ts");
  } else {
    console.log("\n✅ 모든 데이터가 올바릅니다!");
  }

  // Get sample of problematic records
  if (invalidCategories.length > 0) {
    console.log("\n📋 문제가 있는 레코드 샘플 (category):");
    for (const cat of invalidCategories.slice(0, 3)) {
      const samples = await prisma.supportProject.findMany({
        where: {
          category: cat.category,
          deletedAt: null,
          status: "active",
        },
        select: {
          id: true,
          name: true,
          category: true,
          region: true,
        },
        take: 2,
      });

      console.log(`\n   Category: "${cat.category}"`);
      samples.forEach((s) => {
        console.log(`   - [${s.id}] ${s.name}`);
        console.log(`     현재: category="${s.category}", region="${s.region}"`);
      });
    }
  }
}

async function main() {
  try {
    await checkData();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
