/**
 * Clean SupportProject category/region data
 *
 * This script fixes misplaced data identified by check-project-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapping for region names (short → full)
const REGION_MAPPING: Record<string, string> = {
  제주: "제주",
  충남: "충청남도",
  충북: "충청북도",
  전남: "전라남도",
  전북: "전북특별자치도",
  경남: "경상남도",
  경북: "경상북도",
  강원: "강원",
  인천: "인천",
  광주: "광주",
  대전: "대전",
  대구: "대구",
  울산: "울산",
  부산: "부산",
  세종: "세종",
  서울: "서울",
  경기: "경기",
};

// Category mapping for special cases
const CATEGORY_MAPPING: Record<string, string> = {
  "시설ㆍ공간ㆍ보육": "기타",
  "행사ㆍ네트워크": "기타",
  "멘토링ㆍ컨설팅ㆍ교육": "경영",
  내수: "판로",
  "판로ㆍ해외진출": "판로",
  포항: "기타", // 포항은 지역이지만 category로는 "기타"
};

interface CleanStats {
  fixedCategoryToRegion: number;
  fixedInvalidCategory: number;
  fixedDateRegion: number;
  fixedDepartmentRegion: number;
  fixedCityRegion: number;
  total: number;
}

async function cleanData(dryRun = true): Promise<CleanStats> {
  const stats: CleanStats = {
    fixedCategoryToRegion: 0,
    fixedInvalidCategory: 0,
    fixedDateRegion: 0,
    fixedDepartmentRegion: 0,
    fixedCityRegion: 0,
    total: 0,
  };

  console.log(dryRun ? "🔍 DRY RUN - 변경사항 미리보기" : "🚀 실제 데이터 정리 시작");
  console.log("━".repeat(50));

  // 1. Fix category with region names
  console.log("\n📍 Category에 있는 지역명 → Region으로 이동...");
  for (const [shortName, fullName] of Object.entries(REGION_MAPPING)) {
    const projects = await prisma.supportProject.findMany({
      where: {
        category: shortName,
        deletedAt: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        category: true,
        region: true,
      },
    });

    if (projects.length > 0) {
      console.log(`\n   "${shortName}" → region: "${fullName}", category: "기타" (${projects.length}개)`);

      for (const project of projects) {
        if (!dryRun) {
          await prisma.supportProject.update({
            where: { id: project.id },
            data: {
              region: fullName,
              category: "기타",
            },
          });
        }
        stats.fixedCategoryToRegion++;
        stats.total++;
      }

      if (dryRun && projects.length > 0) {
        console.log(`   샘플: [${projects[0].id}] ${projects[0].name}`);
      }
    }
  }

  // 2. Fix invalid categories
  console.log("\n📂 잘못된 Category 값 수정...");
  for (const [oldCat, newCat] of Object.entries(CATEGORY_MAPPING)) {
    const projects = await prisma.supportProject.findMany({
      where: {
        category: oldCat,
        deletedAt: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    if (projects.length > 0) {
      console.log(`\n   "${oldCat}" → "${newCat}" (${projects.length}개)`);

      for (const project of projects) {
        if (!dryRun) {
          await prisma.supportProject.update({
            where: { id: project.id },
            data: {
              category: newCat,
            },
          });
        }
        stats.fixedInvalidCategory++;
        stats.total++;
      }

      if (dryRun && projects.length > 0) {
        console.log(`   샘플: [${projects[0].id}] ${projects[0].name}`);
      }
    }
  }

  // 3. Fix regions with dates
  console.log("\n📅 Region에 있는 날짜 → '전국'으로 변경...");
  const dateRegionProjects = await prisma.supportProject.findMany({
    where: {
      region: {
        startsWith: "2025.",
      },
      deletedAt: null,
      status: "active",
    },
    select: {
      id: true,
      name: true,
      region: true,
    },
  });

  if (dateRegionProjects.length > 0) {
    console.log(`\n   날짜 형식 region → "전국" (${dateRegionProjects.length}개)`);

    for (const project of dateRegionProjects) {
      if (!dryRun) {
        await prisma.supportProject.update({
          where: { id: project.id },
          data: {
            region: "전국",
          },
        });
      }
      stats.fixedDateRegion++;
      stats.total++;
    }

    if (dryRun && dateRegionProjects.length > 0) {
      console.log(`   샘플: "${dateRegionProjects[0].region}" → "전국"`);
      console.log(`         [${dateRegionProjects[0].id}] ${dateRegionProjects[0].name}`);
    }
  }

  // 4. Fix regions with department names
  console.log("\n🏛️ Region에 있는 정부부처명 → '전국'으로 변경...");
  const departmentNames = [
    "과학기술정보통신부",
    "산업통상부",
    "교육부",
    "중소벤처기업부",
  ];

  for (const dept of departmentNames) {
    const projects = await prisma.supportProject.findMany({
      where: {
        region: dept,
        deletedAt: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        region: true,
      },
    });

    if (projects.length > 0) {
      console.log(`\n   "${dept}" → "전국" (${projects.length}개)`);

      for (const project of projects) {
        if (!dryRun) {
          await prisma.supportProject.update({
            where: { id: project.id },
            data: {
              region: "전국",
            },
          });
        }
        stats.fixedDepartmentRegion++;
        stats.total++;
      }

      if (dryRun && projects.length > 0) {
        console.log(`   샘플: [${projects[0].id}] ${projects[0].name}`);
      }
    }
  }

  // 5. Normalize city names in region
  console.log("\n🏙️ Region 도시명 정규화...");
  const cityMapping: Record<string, string> = {
    울산광역시: "울산",
    제주특별자치도: "제주",
    인천광역시: "인천",
    서울특별시: "서울",
    전북특별자치도: "전북특별자치도",
    부산광역시: "부산",
    경기도: "경기",
  };

  for (const [oldName, newName] of Object.entries(cityMapping)) {
    const projects = await prisma.supportProject.findMany({
      where: {
        region: oldName,
        deletedAt: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (projects.length > 0) {
      console.log(`\n   "${oldName}" → "${newName}" (${projects.length}개)`);

      for (const project of projects) {
        if (!dryRun) {
          await prisma.supportProject.update({
            where: { id: project.id },
            data: {
              region: newName,
            },
          });
        }
        stats.fixedCityRegion++;
        stats.total++;
      }

      if (dryRun && projects.length > 0) {
        console.log(`   샘플: [${projects[0].id}] ${projects[0].name}`);
      }
    }
  }

  return stats;
}

async function main() {
  try {
    console.log("╔════════════════════════════════════════════════╗");
    console.log("║  SupportProject 데이터 정리 스크립트           ║");
    console.log("╚════════════════════════════════════════════════╝\n");

    // Dry run first
    console.log("1️⃣ STEP 1: 변경사항 미리보기\n");
    const dryStats = await cleanData(true);

    console.log("\n" + "━".repeat(50));
    console.log("📊 변경 예정 통계:");
    console.log(`   • Category의 지역명 → Region: ${dryStats.fixedCategoryToRegion}개`);
    console.log(`   • 잘못된 Category 수정: ${dryStats.fixedInvalidCategory}개`);
    console.log(`   • Region의 날짜 → 전국: ${dryStats.fixedDateRegion}개`);
    console.log(`   • Region의 부처명 → 전국: ${dryStats.fixedDepartmentRegion}개`);
    console.log(`   • Region 도시명 정규화: ${dryStats.fixedCityRegion}개`);
    console.log(`   📌 총 변경: ${dryStats.total}개 레코드`);
    console.log("━".repeat(50));

    // Ask for confirmation
    console.log("\n⚠️  실제 데이터를 수정하려면 다음 명령을 실행하세요:");
    console.log("   npx tsx scripts/clean-project-data.ts --execute\n");

    // Check if --execute flag is provided
    if (process.argv.includes("--execute")) {
      console.log("\n2️⃣ STEP 2: 실제 데이터 정리 실행\n");
      const realStats = await cleanData(false);

      console.log("\n" + "━".repeat(50));
      console.log("✅ 데이터 정리 완료!");
      console.log(`   • Category의 지역명 → Region: ${realStats.fixedCategoryToRegion}개`);
      console.log(`   • 잘못된 Category 수정: ${realStats.fixedInvalidCategory}개`);
      console.log(`   • Region의 날짜 → 전국: ${realStats.fixedDateRegion}개`);
      console.log(`   • Region의 부처명 → 전국: ${realStats.fixedDepartmentRegion}개`);
      console.log(`   • Region 도시명 정규화: ${realStats.fixedCityRegion}개`);
      console.log(`   📌 총 수정: ${realStats.total}개 레코드`);
      console.log("━".repeat(50));

      console.log("\n✨ 검증을 위해 다음 명령을 실행하세요:");
      console.log("   npx tsx scripts/check-project-data.ts\n");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
