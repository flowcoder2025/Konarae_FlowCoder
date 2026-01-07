#!/usr/bin/env npx tsx
/**
 * 강원테크노파크 HTML 분석
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "playwright";
import * as cheerio from "cheerio";

const url = "https://www.seoultp.or.kr/user/nd19746.do";

async function main() {
  console.log("=== 서울테크노파크 HTML 분석 ===");
  console.log("URL:", url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  // 테이블 분석
  const tables = $("table");
  console.log("\n테이블 개수:", tables.length);

  tables.each((i, table) => {
    const rows = $(table).find("tr");
    console.log(`\n[Table ${i}] rows: ${rows.length}`);

    // 헤더 확인
    const headers = $(table)
      .find("th")
      .map((_, th) => $(th).text().trim())
      .get();
    console.log("  Headers:", headers.slice(0, 8).join(" | "));

    // 첫 5개 데이터 행 확인
    rows.slice(0, 6).each((ri, row) => {
      const cells = $(row).find("td");
      if (cells.length > 0) {
        const cellTexts = cells
          .map((_, td) => $(td).text().trim().substring(0, 35))
          .get();
        const links = $(row)
          .find("a")
          .map((_, a) => $(a).attr("href"))
          .get();
        console.log(
          `  Row ${ri}: [${cells.length} cells] ${cellTexts.slice(0, 5).join(" | ")}`
        );
        if (links.length > 0) {
          console.log(`    Links: ${links.slice(0, 2).join(", ")}`);
        }
      }
    });
  });

  // 리스트 형태 분석
  console.log("\n=== 리스트 구조 분석 ===");

  // board-list, list 클래스를 가진 요소들
  const listContainers = $("ul, ol, div.list, div.board, .board-list, .bbs-list, .notice-list");
  console.log("리스트 컨테이너:", listContainers.length);

  // li 요소 내 링크 확인
  const liWithLinks = $("li").filter((_, li) => $(li).find("a").length > 0);
  console.log("링크가 있는 li 요소:", liWithLinks.length);

  liWithLinks.slice(0, 5).each((i, li) => {
    const text = $(li).text().trim().substring(0, 60);
    const href = $(li).find("a").first().attr("href");
    console.log(`  li[${i}]: ${text}`);
    console.log(`    Link: ${href}`);
  });

  // div 기반 리스트 확인
  const boardItems = $(".board-item, .list-item, .bbs-item, article, .item");
  console.log("\n보드 아이템:", boardItems.length);

  boardItems.slice(0, 3).each((i, item) => {
    const text = $(item).text().trim().substring(0, 80);
    const href = $(item).find("a").first().attr("href");
    console.log(`  item[${i}]: ${text}`);
    if (href) console.log(`    Link: ${href}`);
  });

  // 페이지 주요 콘텐츠 영역 확인
  const mainContent = $("main, #content, .content, #container, .container");
  console.log("\n메인 콘텐츠 영역:", mainContent.length);

  // 페이지 타이틀
  console.log("\n=== 페이지 정보 ===");
  console.log("Title:", $("title").text());

  // 주요 클래스 확인
  const classes = new Set<string>();
  $("[class]").each((_, el) => {
    $(el).attr("class")?.split(" ").forEach(c => {
      if (c && c.length > 2) classes.add(c);
    });
  });
  const boardClasses = Array.from(classes).filter(c =>
    c.includes("board") || c.includes("list") || c.includes("bbs") ||
    c.includes("notice") || c.includes("tbl") || c.includes("table")
  );
  console.log("관련 클래스:", boardClasses.slice(0, 15));

  await browser.close();
}

main().catch(console.error);
