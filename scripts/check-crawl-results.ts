#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function check() {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  // 크롤 잡 통계
  const jobs = await prisma.crawlJob.findMany({
    where: { startedAt: { gte: thirtyMinAgo } },
    select: {
      status: true,
      projectsFound: true,
      projectsNew: true,
      projectsUpdated: true,
      source: { select: { name: true } }
    }
  });

  console.log("📈 크롤 잡 결과 요약");
  console.log("=".repeat(60));

  let totalFound = 0, totalNew = 0, totalUpdated = 0;
  const results: Array<{name: string, found: number, newCount: number, updated: number}> = [];

  for (const j of jobs) {
    totalFound += j.projectsFound || 0;
    totalNew += j.projectsNew || 0;
    totalUpdated += j.projectsUpdated || 0;
    results.push({
      name: j.source.name,
      found: j.projectsFound || 0,
      newCount: j.projectsNew || 0,
      updated: j.projectsUpdated || 0
    });
  }

  console.log("총 잡 수: " + jobs.length);
  console.log("총 발견: " + totalFound);
  console.log("총 신규: " + totalNew);
  console.log("총 업데이트: " + totalUpdated);

  console.log("\n📋 소스별 결과:");
  console.log("-".repeat(60));
  results.sort((a, b) => b.found - a.found);
  for (const r of results) {
    const status = r.found > 0 ? "✅" : "⚪";
    const name = r.name.length > 20 ? r.name.substring(0, 20) + ".." : r.name;
    console.log(status + " " + name.padEnd(22) + " 발견: " + r.found + ", 신규: " + r.newCount + ", 업데이트: " + r.updated);
  }

  // 최근 프로젝트
  const recentProjects = await prisma.supportProject.findMany({
    where: { crawledAt: { gte: thirtyMinAgo } },
    select: {
      name: true,
      region: true,
      attachments: { select: { fileName: true } }
    },
    take: 10
  });

  console.log("\n📝 최근 크롤링된 프로젝트 (" + recentProjects.length + "건):");
  for (let i = 0; i < recentProjects.length; i++) {
    const p = recentProjects[i];
    const title = p.name.length > 45 ? p.name.substring(0, 45) + "..." : p.name;
    console.log((i+1) + ". [" + (p.region || "미지정") + "] " + title);
    console.log("   첨부파일: " + p.attachments.length + "개");
  }

  await prisma.$disconnect();
}
check();
