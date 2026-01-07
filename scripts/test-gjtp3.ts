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

  console.log("=== 광주테크노파크 Header 구조 분석 ===\n");

  // Check table structure
  const table = $("table.list-table");
  console.log(`Table found: ${table.length}`);
  
  // Check for thead
  const thead = table.find("thead");
  console.log(`Thead found: ${thead.length}`);
  if (thead.length) {
    console.log(`Thead HTML: ${thead.html()?.substring(0, 200)}`);
  }
  
  // Check for th elements
  const ths = table.find("th");
  console.log(`TH elements: ${ths.length}`);
  ths.each((i, th) => {
    console.log(`  TH ${i}: "${$(th).text().trim()}"`);
  });
  
  // Check first row
  const firstRow = table.find("tr").first();
  console.log(`\nFirst row tag contents:`);
  firstRow.children().each((i, el) => {
    console.log(`  Child ${i}: <${el.tagName}> "${$(el).text().trim().substring(0, 30)}"`);
  });

  // Check full header detection selector
  const headerTexts: string[] = [];
  $('table thead tr th, table thead tr td, table tr th').each((_, el) => {
    headerTexts.push($(el).text().trim());
  });
  console.log(`\nHeader detection result: "${headerTexts.join(' | ')}"`);

  await browser.close();
}

main();
