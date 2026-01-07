#!/usr/bin/env npx tsx
/**
 * 인천테크노파크 HTML 분석
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://itp.or.kr/intro.asp?tmid=13";

async function main() {
  console.log("=== 인천테크노파크 HTML 분석 ===");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // 테이블 분석
  const tables = $("table");
  console.log("테이블 개수:", tables.length);

  tables.each((i, table) => {
    const rows = $(table).find("tr");
    console.log(`\n[Table ${i}] ${rows.length} rows`);

    // 테이블 클래스 확인
    const tableClass = $(table).attr("class") || "no-class";
    console.log(`  Class: ${tableClass}`);

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
          .map((_, td) => $(td).text().trim().substring(0, 30))
          .get();
        console.log(`  Row ${ri}: [${cells.length} cells] ${cellTexts.join(" | ")}`);

        // 링크 분석
        const links = $(row).find("a");
        links.each((li, link) => {
          const href = $(link).attr("href");
          const text = $(link).text().trim().substring(0, 40);
          const onclick = $(link).attr("onclick");
          if (href && href !== "#") {
            console.log(`    Link[${li}]: "${text}" href=${href?.substring(0, 60)}`);
            if (onclick) console.log(`    onclick: ${onclick}`);
          }
        });
      }
    });
  });

  await browser.close();
}

main().catch(console.error);

// 추가: 상세 URL 패턴 분석
async function analyzeDetailUrl() {
  console.log("\n=== 상세 URL 패턴 분석 ===");
  
  const browser = await (await import("playwright")).chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://itp.or.kr/intro.asp?tmid=13", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // 첫 번째 항목 클릭 후 URL 확인
  const firstLink = page.locator("table.list tbody tr:first-child td:nth-child(3) a");
  const href = await firstLink.getAttribute("href");
  console.log("첫 번째 링크 href:", href);
  
  // JavaScript 실행 후 URL 확인
  try {
    await firstLink.click();
    await page.waitForTimeout(2000);
    console.log("클릭 후 URL:", page.url());
  } catch (e) {
    console.log("클릭 실패:", (e as Error).message);
  }
  
  await browser.close();
}

analyzeDetailUrl().catch(console.error);
