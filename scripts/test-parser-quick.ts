#!/usr/bin/env npx tsx
/**
 * Quick parser test for specific sites
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const sites = [
  { name: "경북테크노파크", url: "https://www.gbtp.or.kr/user/board.do?bbsId=BBSMSTR_000000000021" },
  { name: "광주테크노파크", url: "https://www.gjtp.or.kr/home/business.cs" },
  { name: "대전테크노파크", url: "https://www.djtp.or.kr/menu.es?mid=a20100000000" },
  { name: "포항테크노파크", url: "https://www.ptp.or.kr/main/board/index.do?menu_idx=116&manage_idx=15" },
];

async function main() {
  console.log("=== Quick Parser Test ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
    locale: "ko-KR",
  });

  for (const { name, url } of sites) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[${name}]`);
    console.log(`URL: ${url}`);
    console.log("=".repeat(60));

    const page = await context.newPage();
    try {
      await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const html = await page.content();
      const $ = cheerio.load(html);

      // Test table rows
      const rows = $("tbody tr, table tr");
      console.log(`Total rows found: ${rows.length}`);

      let validCount = 0;
      rows.each((idx, el) => {
        if (idx >= 8) return; // First 8 only
        const $row = $(el);
        if ($row.find("th").length > 0) return; // Skip header

        const cells = $row.find("td");
        if (cells.length < 3) return;

        // Check first cell for "공지"
        const firstCell = $(cells[0]).text().trim();
        if (firstCell === "공지" || firstCell === "필독") {
          console.log(`  [SKIP] Row ${idx}: 공지/필독`);
          return;
        }

        // Find link
        let title = "";
        let link = "";
        cells.each((ci, cell) => {
          const $link = $(cell).find("a").first();
          if ($link.length > 0 && !title) {
            const linkText = $link.text().trim();
            if (linkText.length >= 5 && !/^\d+$/.test(linkText)) {
              title = linkText;
              link = $link.attr("href") || "";
            }
          }
        });

        // Find date
        let date = "";
        const text = $row.text();
        let match = text.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/);
        if (match) {
          date = match[0];
        } else {
          match = text.match(/(\d{2})[.\-](\d{2})[.\-](\d{2})/);
          if (match) {
            date = `20${match[1]}-${match[2]}-${match[3]}`;
          }
        }

        if (title && title.length > 5) {
          validCount++;
          const isJsLink = link.includes("javascript:");
          const linkInfo = isJsLink ? "[JS]" : link.substring(0, 40);
          console.log(`  ✅ Row ${idx}: ${title.substring(0, 45)}... | ${date} | ${linkInfo}`);
        }
      });
      console.log(`\n📊 Valid projects: ${validCount}`);
    } catch (e: any) {
      console.log(`❌ Error: ${e.message}`);
    }
    await page.close();
  }

  await browser.close();
  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
