#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

async function checkTableType(name: string, url: string) {
  console.log(`\n=== ${name} ===`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  const html = await page.content();
  const $ = cheerio.load(html);

  // 헤더 분석
  const headerTexts: string[] = [];
  $('table thead tr th, table thead tr td, table tr th').each((_, el) => {
    headerTexts.push($(el).text().trim().toLowerCase());
  });
  const headerText = headerTexts.join(' ');
  console.log("Headers:", headerText.substring(0, 100));

  // 타입 판정
  if (headerText.includes('지역')) {
    console.log("Type: central");
  } else if (headerText.includes('접수기간') && headerText.includes('상태')) {
    console.log("Type: individual");
  } else if (headerText.includes('번호') && (headerText.includes('제목') || headerText.includes('공고명'))) {
    console.log("Type: simple");
  } else {
    console.log("Type: generic");
  }

  // 첫 번째 데이터 행의 링크 분석
  const firstDataRow = $('table tr').filter((_, row) => $(row).find('td').length >= 3).first();
  const link = firstDataRow.find('a').first();
  console.log("First link href:", link.attr('href')?.substring(0, 80));
  console.log("First link onclick:", link.attr('onclick')?.substring(0, 80));

  await browser.close();
}

async function main() {
  await checkTableType("광주테크노파크", "https://www.gjtp.or.kr/home/business.cs");
  await checkTableType("대구테크노파크", "https://www.dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003");
}

main().catch(console.error);
