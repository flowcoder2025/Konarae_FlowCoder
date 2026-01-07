#!/usr/bin/env npx tsx
/**
 * 경기대진테크노파크 div 기반 테이블 분석
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://gdtp.or.kr/board/announcement";

async function main() {
  console.log("=== 경기대진테크노파크 div 테이블 분석 ===");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // tbl type_bbs 영역 찾기
  const tblBbs = $(".tbl.type_bbs");
  console.log("tbl.type_bbs 개수:", tblBbs.length);

  // thead 분석
  const thead = tblBbs.find(".thead");
  console.log("thead 텍스트:", thead.text().trim().substring(0, 100));

  // tbody 또는 콘텐츠 행 분석
  const tbody = tblBbs.find(".tbody, .row, .colgroup");
  console.log("tbody/row 개수:", tbody.length);

  // 실제 데이터 행 찾기
  const rows = $(".tbl.type_bbs .colgroup").filter((_, el) => {
    const hasLink = $(el).find("a").length > 0;
    const text = $(el).text();
    return hasLink && text.length > 10;
  });
  console.log("\n데이터 행 개수:", rows.length);

  // 첫 5개 행 분석
  rows.slice(0, 5).each((i, row) => {
    console.log(`\n=== Row ${i} ===`);
    const links = $(row).find("a");
    links.each((li, link) => {
      const href = $(link).attr("href");
      const text = $(link).text().trim().substring(0, 50);
      if (href && !href.includes("javascript:") && text.length > 3) {
        console.log(`  Link: "${text}" → ${href}`);
      }
    });

    // 날짜 패턴 찾기
    const dateMatch = $(row).text().match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
    if (dateMatch) {
      console.log(`  Date: ${dateMatch[0]}`);
    }
  });

  await browser.close();
}

main().catch(console.error);
