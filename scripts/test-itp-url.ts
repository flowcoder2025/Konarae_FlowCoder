#!/usr/bin/env npx tsx
/**
 * 인천테크노파크 상세 URL 패턴 확인
 */
import { chromium } from "playwright";

async function main() {
  console.log("=== 인천테크노파크 상세 URL 패턴 ===\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://itp.or.kr/intro.asp?tmid=13", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 첫 번째 항목 클릭 후 URL 확인
  const firstLink = page.locator("table.list tbody tr:first-child td:nth-child(3) a");
  const href = await firstLink.getAttribute("href");
  console.log("링크 href:", href);

  // JavaScript 실행 후 URL 확인
  try {
    await firstLink.click();
    await page.waitForTimeout(2000);
    console.log("클릭 후 URL:", page.url());
  } catch (e) {
    console.log("클릭 실패:", (e as Error).message);
  }

  await browser.close();
}

main().catch(console.error);
