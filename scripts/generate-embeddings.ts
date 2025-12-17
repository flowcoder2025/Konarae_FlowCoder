/**
 * Generate embeddings for SupportProjects with needsEmbedding=true
 * Run: set -a && source .env.local && set +a && npx tsx scripts/generate-embeddings.ts
 */

import { prisma } from "../src/lib/prisma";
import { storeDocumentEmbeddings } from "../src/lib/rag";

const BATCH_SIZE = 10; // Process 10 projects at a time

async function main() {
  console.log("=== 지원사업 임베딩 생성 시작 ===\n");

  // Get projects needing embeddings
  const projects = await prisma.supportProject.findMany({
    where: {
      needsEmbedding: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      organization: true,
      category: true,
      subCategory: true,
      target: true,
      eligibility: true,
      summary: true,
      description: true,
    },
    take: 100, // Process up to 100 projects
  });

  console.log(`총 ${projects.length}개 프로젝트 임베딩 생성 예정\n`);

  if (projects.length === 0) {
    console.log("임베딩이 필요한 프로젝트가 없습니다.");
    await prisma.$disconnect();
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];

    try {
      // Build content string for embedding
      const content = [
        project.name,
        project.organization,
        project.category,
        project.subCategory,
        project.target,
        project.eligibility,
        project.summary,
        project.description,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (content.length < 50) {
        console.log(`[${i + 1}/${projects.length}] SKIP (내용 부족): ${project.name.substring(0, 30)}...`);
        continue;
      }

      // Generate and store embeddings
      await storeDocumentEmbeddings(
        "support_project",
        project.id,
        content,
        {
          category: project.category,
          organization: project.organization,
        }
      );

      // Update needsEmbedding flag
      await prisma.supportProject.update({
        where: { id: project.id },
        data: { needsEmbedding: false },
      });

      successCount++;
      console.log(`[${i + 1}/${projects.length}] OK: ${project.name.substring(0, 40)}...`);

      // Rate limiting - wait 200ms between API calls
      if (i < projects.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      errorCount++;
      console.error(`[${i + 1}/${projects.length}] ERROR: ${project.name.substring(0, 30)}...`);
      console.error(`  ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  console.log("\n=== 임베딩 생성 완료 ===");
  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${errorCount}개`);

  // Final count
  const totalEmbeddings = await prisma.documentEmbedding.count({
    where: { sourceType: "support_project" },
  });
  console.log(`\n총 임베딩 수: ${totalEmbeddings}개`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
