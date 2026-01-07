#!/usr/bin/env npx tsx
/**
 * 경기대진테크노파크 HTML 분석
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://gdtp.or.kr/board/announcement";

async function main() {
  console.log("=== 경기대진테크노파크 HTML 분석 ===");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // 테이블 확인
  const tables = $("table");
  console.log("테이블 개수:", tables.length);

  // 리스트/카드 요소 확인
  const listItems = $("ul li, .list-item, .board-item, article, .item");
  console.log("리스트 아이템:", listItems.length);

  // 모든 링크 확인
  const allLinks = $("a[href]");
  console.log("전체 링크 수:", allLinks.length);

  // 콘텐츠 영역 확인
  const contentClasses = new Set<string>();
  $("[class]").each((_, el) => {
    const cls = $(el).attr("class") || "";
    cls.split(" ").forEach((c) => {
      if (c.includes("board") || c.includes("list") || c.includes("item") || c.includes("article") || c.includes("card")) {
        contentClasses.add(c);
      }
    });
  });
  console.log("\n관련 클래스:", [...contentClasses].slice(0, 15));

  // 가장 유력한 리스트 영역 찾기
  const boardDivs = $("div[class*='board'], div[class*='list'], div[class*='content']");
  console.log("\n보드 관련 div:", boardDivs.length);

  boardDivs.slice(0, 5).each((i, div) => {
    const cls = $(div).attr("class");
    const links = $(div).find("a");
    console.log(`  [${i}] class="${cls}" links=${links.length}`);
  });

  // 첫 번째 콘텐츠 영역의 HTML 샘플
  const mainContent = $("main, #content, .content, .container").first();
  if (mainContent.length) {
    const innerHtml = mainContent.html()?.substring(0, 2000);
    console.log("\n=== 메인 콘텐츠 HTML 샘플 ===");
    console.log(innerHtml);
  }

  await browser.close();
}

main().catch(console.error);
