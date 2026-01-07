#!/usr/bin/env npx tsx
/**
 * Debug 서울테크노파크 parsing
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://www.seoultp.or.kr/user/nd19746.do";

async function main() {
  console.log("=== 서울테크노파크 파싱 디버그 ===\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // 테이블 타입 감지 시뮬레이션
  const headerTexts: string[] = [];
  $("table thead tr th, table thead tr td, table tr th").each((_, el) => {
    headerTexts.push($(el).text().trim().toLowerCase());
  });
  const headerText = headerTexts.join(" ");
  console.log("Header text:", headerText.substring(0, 100));

  // simple 타입 확인
  const isSimple =
    headerText.includes("번호") &&
    (headerText.includes("제목") || headerText.includes("공고명")) &&
    (headerText.includes("등록일") ||
      headerText.includes("게시일") ||
      headerText.includes("작성일"));
  console.log("Is simple type:", isSimple);

  // 테이블 행 분석
  const rows = $("table.board-list tbody tr");
  console.log("\n행 수:", rows.length);

  rows.slice(0, 5).each((i, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    console.log(`\n=== Row ${i} (${cells.length} cells) ===`);

    // 공지 체크
    const firstCellText = $(cells[0]).text().trim();
    const hasLink = $row.find("a[href]").length > 0;
    const hasDate = $row.text().match(/\d{4}[.\-\/]\d{2}[.\-\/]\d{2}/);
    console.log(`First cell: "${firstCellText}"`);
    console.log(`Has link: ${hasLink}, Has date: ${!!hasDate}`);

    // 스킵 여부
    const shouldSkip =
      (firstCellText === "공지" ||
        firstCellText === "필독" ||
        firstCellText === "notice") &&
      !hasLink &&
      !hasDate;
    console.log(`Should skip: ${shouldSkip}`);

    // Cell 1 분석 (simple 파서용)
    const cell1 = $(cells[1]);
    const link = cell1.find("a").first();
    console.log(`Cell 1 text: "${cell1.text().trim().substring(0, 50)}..."`);
    console.log(`Cell 1 has link: ${link.length > 0}`);

    if (link.length > 0) {
      console.log(`Link text: "${link.text().trim().substring(0, 50)}..."`);
      console.log(`Link href: "${link.attr("href")?.substring(0, 50)}..."`);
    }

    // 날짜 찾기
    cells.each((cellIdx, cell) => {
      const text = $(cell).text().trim();
      const dateMatch = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
      if (dateMatch) {
        console.log(`Date found in cell ${cellIdx}: ${dateMatch[0]}`);
      }
    });
  });

  await browser.close();
}

main().catch(console.error);
