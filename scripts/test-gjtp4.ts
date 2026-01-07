#!/usr/bin/env npx tsx
import { chromium } from "playwright";
import * as cheerio from "cheerio";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.gjtp.or.kr/home/business.cs", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const html = await page.content();
  const $ = cheerio.load(html);

  console.log("=== 광주테크노파크 Row 분석 ===\n");

  const rows = $("tbody tr, table tr");
  console.log(`Total rows: ${rows.length}\n`);

  rows.each((ri, row) => {
    if (ri >= 5) return; // First 5 rows
    
    const $row = $(row);
    const cells = $row.find("td");
    const ths = $row.find("th");
    
    console.log(`Row ${ri}: ${cells.length} TDs, ${ths.length} THs`);
    
    // Skip if header row (has th)
    if (ths.length > 0 && cells.length === 0) {
      console.log(`  → Skipping: Header row (has TH only)`);
      return;
    }
    
    if (cells.length < 3) {
      console.log(`  → Skipping: cells.length < 3`);
      return;
    }
    
    // Check first cell for "공지"
    const firstCell = $(cells[0]).text().trim();
    console.log(`  First cell: "${firstCell.substring(0, 30)}..."`);
    
    if (firstCell === "공지" || firstCell === "필독") {
      console.log(`  → Skipping: 공지/필독`);
      return;
    }
    
    // Find link
    let title = "";
    let link = "";
    cells.each((ci, cell) => {
      const $link = $(cell).find("a").first();
      if ($link.length > 0 && !title) {
        const linkText = $link.text().trim();
        if (linkText.length >= 5 && !/^\d+$/.test(linkText)) {
          title = linkText;
          link = $link.attr("href") || "";
        }
      }
    });
    
    console.log(`  Title found: ${title ? `"${title.substring(0, 40)}..."` : "(none)"}`);
    console.log(`  Link found: ${link ? link.substring(0, 50) : "(none)"}`);
    
    if (title && title.length > 5) {
      console.log(`  ✅ VALID`);
    }
    console.log("");
  });

  await browser.close();
}

main();
