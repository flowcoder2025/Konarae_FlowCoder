#!/usr/bin/env npx tsx
/**
 * 경남테크노파크 상세 HTML 분석 - 링크 확인
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://www.gntp.or.kr/sub05/sub01.asp";

async function main() {
  console.log("=== 경남테크노파크 링크 분석 ===\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // Table 1 (사업공고) 분석
  const tables = $("table.news-table");
  console.log("사업공고 테이블 (Table 1) 상세 분석:\n");

  const businessTable = $(tables[1]);
  const rows = businessTable.find("tr");

  rows.slice(0, 5).each((i, row) => {
    console.log(`=== Row ${i} ===`);

    // 행 HTML
    const rowHtml = $(row).html()?.substring(0, 800);
    console.log("HTML:", rowHtml);
    console.log();

    // onclick 확인
    const onclick = $(row).attr("onclick");
    if (onclick) console.log("Row onclick:", onclick);

    // 모든 요소의 onclick 확인
    $(row).find("[onclick]").each((j, el) => {
      console.log(`  Element[${j}] onclick:`, $(el).attr("onclick"));
    });

    // data 속성 확인
    $(row).find("[data-id], [data-seq], [data-idx]").each((j, el) => {
      console.log(`  Element[${j}] data:`, $(el).attr("data-id") || $(el).attr("data-seq") || $(el).attr("data-idx"));
    });

    console.log();
  });

  await browser.close();
}

main().catch(console.error);
