#!/usr/bin/env npx tsx
/**
 * 경남테크노파크 HTML 분석
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://www.gntp.or.kr/sub05/sub01.asp";

async function main() {
  console.log("=== 경남테크노파크 HTML 분석 ===");
  console.log("URL:", url);

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

  // 페이지 제목
  console.log("\nPage title:", $("title").text());

  // 테이블 분석
  const tables = $("table");
  console.log("\n테이블 개수:", tables.length);

  tables.each((i, table) => {
    const rows = $(table).find("tr");
    const tableClass = $(table).attr("class") || "no-class";
    console.log(`\n[Table ${i}] class="${tableClass}" rows=${rows.length}`);

    // 헤더 확인
    const headers = $(table)
      .find("th")
      .map((_, th) => $(th).text().trim())
      .get();
    if (headers.length) console.log("  Headers:", headers.join(" | "));

    // 첫 5개 데이터 행 확인
    rows.slice(0, 6).each((ri, row) => {
      const cells = $(row).find("td");
      if (cells.length > 0) {
        const cellTexts = cells
          .map((_, td) => $(td).text().trim().substring(0, 25))
          .get();
        console.log(`  Row ${ri}: [${cells.length} cells] ${cellTexts.join(" | ")}`);

        // 링크 분석
        const links = $(row).find("a");
        links.each((li, link) => {
          const href = $(link).attr("href");
          const text = $(link).text().trim().substring(0, 40);
          if (href && text.length > 3) {
            console.log(`    Link: "${text}" → ${href?.substring(0, 60)}`);
          }
        });
      }
    });
  });

  // 리스트 구조 확인
  console.log("\n=== 리스트 구조 ===");
  const listItems = $("ul li, .list-item, .board-item, article");
  console.log("리스트 아이템:", listItems.length);

  // 주요 클래스 확인
  const classes = new Set<string>();
  $("[class]").each((_, el) => {
    const cls = $(el).attr("class") || "";
    cls.split(" ").forEach((c) => {
      if (c.includes("board") || c.includes("list") || c.includes("bbs") || c.includes("table")) {
        classes.add(c);
      }
    });
  });
  console.log("\n관련 클래스:", [...classes].slice(0, 20));

  // 전체 HTML 길이
  console.log("\nHTML 길이:", html.length);

  await browser.close();
}

main().catch(console.error);
