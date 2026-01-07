#!/usr/bin/env npx tsx
import { chromium } from "playwright";
import * as cheerio from "cheerio";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
    locale: "ko-KR",
  });

  const page = await context.newPage();
  await page.goto("https://www.gjtp.or.kr/home/business.cs", { timeout: 30000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  const $ = cheerio.load(html);

  console.log("=== 광주테크노파크 상세 분석 ===\n");

  // Check table structure
  const tables = $("table");
  console.log(`Tables found: ${tables.length}`);

  tables.each((ti, table) => {
    const className = $(table).attr("class") || "";
    const rows = $(table).find("tr");
    console.log(`\nTable ${ti} (class="${className}"): ${rows.length} rows`);

    rows.each((ri, row) => {
      if (ri >= 5) return;
      const $row = $(row);
      const cells = $row.find("td, th");
      const cellTexts = cells.map((_, c) => $(c).text().trim().substring(0, 30)).get();
      console.log(`  Row ${ri}: ${cellTexts.join(" | ")}`);
      
      // Check for links
      const links = $row.find("a");
      if (links.length > 0) {
        console.log(`    Links: ${links.length} (href: ${$(links[0]).attr("href")?.substring(0, 50)})`);
      }
    });
  });

  await browser.close();
}

main();
