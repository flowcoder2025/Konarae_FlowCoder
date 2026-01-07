#!/usr/bin/env npx tsx
/**
 * 경기테크노파크 상세 분석 - onclick 핸들러 확인
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://pms.gtp.or.kr/web/business/webBusinessList.do";

async function main() {
  console.log("=== 경기테크노파크 상세 분석 ===");
  console.log("URL:", url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // 두 번째 테이블 (데이터 테이블) 분석
  const tables = $("table");
  console.log("\n테이블 개수:", tables.length);

  // 두 번째 테이블 상세 분석
  const dataTable = $(tables[1]);
  const rows = dataTable.find("tbody tr");
  console.log("\n데이터 테이블 행 수:", rows.length);

  rows.slice(0, 3).each((i, row) => {
    console.log(`\n=== Row ${i} ===`);

    // 행 전체 HTML 확인
    const rowHtml = $(row).html()?.substring(0, 500);
    console.log("Row HTML:", rowHtml);

    // 클릭 이벤트 확인
    const onclick = $(row).attr("onclick");
    if (onclick) {
      console.log("  Row onclick:", onclick);
    }

    // 모든 링크와 onclick 확인
    $(row)
      .find("a, td")
      .each((j, el) => {
        const href = $(el).attr("href");
        const elOnclick = $(el).attr("onclick");
        const dataId = $(el).attr("data-id") || $(el).attr("data-seq");

        if (href && href !== "#none" && href !== "#") {
          console.log(`  Element[${j}] href:`, href);
        }
        if (elOnclick) {
          console.log(`  Element[${j}] onclick:`, elOnclick);
        }
        if (dataId) {
          console.log(`  Element[${j}] data-id/seq:`, dataId);
        }
      });
  });

  // JavaScript 함수 검색
  console.log("\n=== JavaScript 함수 검색 ===");
  const scripts = $("script").map((_, s) => $(s).html()).get().join("\n");

  // viewDetail, goView 등의 패턴 찾기
  const funcPatterns = scripts.match(/function\s+(view|go|detail|open)\w*\s*\([^)]*\)/gi);
  if (funcPatterns) {
    console.log("관련 함수:", funcPatterns.slice(0, 5));
  }

  // 전체 페이지에서 onclick 패턴 찾기
  const onclickMatches = html.match(/onclick="[^"]*"/g);
  if (onclickMatches) {
    console.log("\nonclick 패턴 예시:", [...new Set(onclickMatches)].slice(0, 10));
  }

  await browser.close();
}

main().catch(console.error);
