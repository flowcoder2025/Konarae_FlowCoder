#!/usr/bin/env npx tsx
/**
 * 경기대진테크노파크 ibbs_list 분석
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://gdtp.or.kr/board/announcement";

async function main() {
  console.log("=== 경기대진테크노파크 ibbs_list 분석 ===");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // ibbs_list 클래스 확인
  const ibbsList = $(".ibbs_list");
  console.log("ibbs_list 개수:", ibbsList.length);

  ibbsList.each((i, list) => {
    const listHtml = $(list).html()?.substring(0, 3000);
    console.log(`\n=== ibbs_list[${i}] ===`);
    console.log(listHtml);
  });

  // listview 클래스 확인
  const listview = $(".listview");
  console.log("\n\nlistview 개수:", listview.length);

  listview.each((i, el) => {
    const innerHtml = $(el).html()?.substring(0, 2000);
    console.log(`\n=== listview[${i}] ===`);
    console.log(innerHtml);
  });

  await browser.close();
}

main().catch(console.error);
