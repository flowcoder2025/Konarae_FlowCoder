#!/usr/bin/env npx tsx
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 광주TP 상세 URL 테스트
  console.log("=== 광주테크노파크 상세 URL 테스트 ===");
  const gjUrls = [
    "https://www.gjtp.or.kr/home/business.cs?act=view&bsnssId=2064",
    "https://www.gjtp.or.kr/home/business.cs?act=view&bsnssId=2064&ctg01=01"
  ];
  for (const url of gjUrls) {
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      const title = await page.title();
      console.log(`${resp?.status()} - ${url.substring(0, 70)}...`);
      console.log(`  Title: ${title}`);
    } catch (e) {
      console.log(`ERROR - ${url}: ${(e as Error).message}`);
    }
  }

  // 대구TP onclick 함수 분석
  console.log("\n=== 대구테크노파크 onclick 분석 ===");
  await page.goto("https://www.dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003", { waitUntil: "networkidle" });
  
  // fn_egov_inqire_notice 함수 코드 확인
  const fnCode = await page.evaluate(() => {
    if (typeof (window as any).fn_egov_inqire_notice === 'function') {
      return (window as any).fn_egov_inqire_notice.toString();
    }
    return "Function not found";
  });
  console.log("fn_egov_inqire_notice:", fnCode.substring(0, 500));

  // 첫 번째 항목 클릭하여 실제 URL 확인
  console.log("\n클릭 테스트...");
  const firstLink = await page.$('table.tablelist tbody tr td a');
  if (firstLink) {
    const onclick = await firstLink.getAttribute('onclick');
    console.log("onclick:", onclick);
    
    // 클릭 후 URL 추적
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page.waitForNavigation({ timeout: 5000 }).catch(() => null),
      firstLink.click()
    ]);
    
    console.log("After click URL:", page.url());
    if (newPage) {
      console.log("New page URL:", newPage.url());
      await newPage.close();
    }
  }

  await browser.close();
}

main().catch(console.error);
