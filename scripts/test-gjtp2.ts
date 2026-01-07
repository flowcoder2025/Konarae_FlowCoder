#!/usr/bin/env npx tsx
import { chromium } from "playwright";
import * as cheerio from "cheerio";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
  });

  const page = await context.newPage();
  await page.goto("https://www.gjtp.or.kr/home/business.cs", { timeout: 30000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  const $ = cheerio.load(html);

  console.log("=== 광주테크노파크 Row 1 상세 분석 ===\n");

  const rows = $("table.list-table tr");
  const row1 = $(rows[1]); // First data row
  
  console.log("Row 1 HTML structure:");
  const cells = row1.find("td");
  console.log(`Total cells: ${cells.length}`);
  
  cells.each((ci, cell) => {
    const $cell = $(cell);
    const text = $cell.text().trim();
    const $link = $cell.find("a").first();
    const hasLink = $link.length > 0;
    const linkText = hasLink ? $link.text().trim() : "";
    const linkHref = hasLink ? $link.attr("href") : "";
    
    console.log(`\nCell ${ci}:`);
    console.log(`  Text: "${text.substring(0, 60)}"`);
    console.log(`  Has Link: ${hasLink}`);
    if (hasLink) {
      console.log(`  Link Text: "${linkText.substring(0, 60)}"`);
      console.log(`  Link Href: "${linkHref}"`);
      console.log(`  Link text length: ${linkText.length}`);
      console.log(`  Is only digits: ${/^\d+$/.test(linkText)}`);
    }
  });
  
  // Check date extraction
  const rowText = row1.text();
  console.log(`\nFull row text: "${rowText.substring(0, 150)}..."`);
  
  const dateMatch = rowText.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
  console.log(`Date match: ${dateMatch ? dateMatch[0] : "none"}`);

  await browser.close();
}

main();
