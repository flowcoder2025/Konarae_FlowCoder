#!/usr/bin/env npx tsx
/**
 * 광주/대구/울산 테크노파크 동시 분석
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

async function analyzeUrl(name: string, url: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${name}]`);
  console.log(`URL: ${url}`);
  console.log("=".repeat(60));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log("Navigation error:", (e as Error).message);
  }

  const html = await page.content();
  const $ = cheerio.load(html);

  console.log("\nPage title:", $("title").text().trim());
  console.log("HTML length:", html.length);

  // 테이블 분석
  const tables = $("table");
  console.log("\n테이블 개수:", tables.length);

  tables.each((i, table) => {
    const rows = $(table).find("tr");
    const tableClass = $(table).attr("class") || "no-class";
    if (rows.length > 2) {
      console.log(`\n[Table ${i}] class="${tableClass}" rows=${rows.length}`);

      const headers = $(table).find("th").map((_, th) => $(th).text().trim()).get();
      if (headers.length) console.log("  Headers:", headers.join(" | "));

      // 데이터 행 분석
      rows.slice(0, 5).each((ri, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 3) {
          const cellTexts = cells.map((_, td) => $(td).text().trim().substring(0, 25)).get();
          console.log(`  Row ${ri}: [${cells.length} cells] ${cellTexts.join(" | ")}`);

          // 링크 분석
          $(row).find("a").slice(0, 2).each((_, link) => {
            const href = $(link).attr("href");
            const onclick = $(link).attr("onclick");
            const text = $(link).text().trim().substring(0, 40);
            if (text.length > 3) {
              console.log(`    Link: "${text}" → href=${href?.substring(0, 50)} onclick=${onclick?.substring(0, 50)}`);
            }
          });
        }
      });
    }
  });

  // div 기반 구조 확인
  const divSelectors = [".board-list", ".list", ".bbs", ".notice-list", ".post-list", "[class*='list']", "[class*='board']"];
  divSelectors.forEach(sel => {
    const items = $(sel);
    if (items.length > 0 && items.find("a").length > 0) {
      console.log(`\n${sel}: ${items.length}개 (links: ${items.find("a").length})`);
      items.first().find("a").slice(0, 3).each((i, link) => {
        const href = $(link).attr("href");
        const text = $(link).text().trim().substring(0, 50);
        if (text.length > 5) {
          console.log(`  [${i}] "${text}" → ${href?.substring(0, 60)}`);
        }
      });
    }
  });

  // 주요 링크 (사업/공고 관련)
  console.log("\n사업공고 관련 링크:");
  let foundLinks = 0;
  $("a").each((i, link) => {
    if (foundLinks >= 10) return false;
    const href = $(link).attr("href") || "";
    const onclick = $(link).attr("onclick") || "";
    const text = $(link).text().trim();
    if (text.length > 10 && (
      href.includes("view") || href.includes("detail") || href.includes("bbs") ||
      text.includes("공고") || text.includes("사업") || text.includes("지원") ||
      onclick.includes("view") || onclick.includes("detail")
    )) {
      console.log(`  "${text.substring(0, 50)}" → ${(href || onclick).substring(0, 60)}`);
      foundLinks++;
    }
  });

  await browser.close();
}

async function main() {
  // DB에서 3개 소스 조회
  const sources = await prisma.crawlSource.findMany({
    where: {
      name: { in: ["광주테크노파크", "대구테크노파크", "울산테크노파크"] }
    }
  });

  for (const source of sources) {
    await analyzeUrl(source.name, source.url);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
