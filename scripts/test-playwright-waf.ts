#!/usr/bin/env npx tsx
/**
 * Playwright WAF 우회 테스트 - 업데이트된 URL
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { 
  fetchWithPlaywright, 
  isWafBlockedDomain, 
  closeBrowser,
  WAF_BLOCKED_DOMAINS 
} from "../src/lib/crawler/playwright-browser";

async function main() {
  console.log("=== Playwright WAF 우회 최종 테스트 ===\n");

  // 업데이트된 URL들
  const testUrls = [
    { name: "경기대진테크노파크", url: "https://gdtp.or.kr/board/announcement" },
    { name: "경남테크노파크", url: "https://www.gntp.or.kr/sub05/sub01.asp" },
    { name: "경북테크노파크", url: "https://www.gbtp.or.kr/user/board.do?bbsId=BBSMSTR_000000000021" },
    { name: "대구테크노파크", url: "https://www.dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003" },
    { name: "울산테크노파크", url: "https://www.utp.or.kr/board/list.do?boardId=notice" },
    { name: "전남테크노파크", url: "https://www.jntp.or.kr/base/board/list?boardManagementNo=11&menuLevel=2&menuNo=44" },
    { name: "제주테크노파크", url: "https://www.jejutp.or.kr/board/business" },
    { name: "포항테크노파크", url: "https://www.ptp.or.kr/main/board/index.do?menu_idx=116&manage_idx=15" },
  ];

  const results: { name: string; success: boolean; tables: number; htmlSize: number; error?: string }[] = [];

  for (const { name, url } of testUrls) {
    console.log(`\n[${name}]`);
    console.log(`URL: ${url}`);
    console.log(`WAF: ${isWafBlockedDomain(url) ? '✓' : '✗'}`);
    
    try {
      const startTime = Date.now();
      const { html } = await fetchWithPlaywright(url, {
        timeout: 30000,
        waitForSelector: "table",
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      const tableCount = (html.match(/<table/gi) || []).length;
      const trCount = (html.match(/<tr/gi) || []).length;
      console.log(`✅ 성공 (${duration}초) - ${(html.length/1024).toFixed(0)}KB, 테이블: ${tableCount}개, 행: ${trCount}개`);
      results.push({ name, success: true, tables: tableCount, htmlSize: html.length });
      
    } catch (error: any) {
      console.log(`❌ 실패: ${error.message.substring(0, 50)}`);
      results.push({ name, success: false, tables: 0, htmlSize: 0, error: error.message });
    }
  }

  await closeBrowser();
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 최종 결과");
  console.log("=".repeat(60));
  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  console.log(`✅ 성공: ${success.length}개`);
  success.forEach(r => console.log(`   - ${r.name}: ${r.tables}개 테이블`));
  console.log(`❌ 실패: ${failed.length}개`);
  failed.forEach(r => console.log(`   - ${r.name}: ${r.error?.substring(0, 40)}`));
}

main().catch(console.error);
