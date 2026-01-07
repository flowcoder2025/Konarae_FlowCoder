#!/usr/bin/env npx tsx
/**
 * 테이블 구조 사이트 상세 분석 (파싱 실패 원인 분석)
 */
import { chromium } from "playwright";

async function main() {
  console.log("=== 테이블 구조 사이트 상세 분석 ===\n");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
    locale: "ko-KR",
  });

  // 테이블 구조인데 파싱 실패한 사이트
  const sites = [
    { name: "경북테크노파크", url: "https://www.gbtp.or.kr/user/board.do?bbsId=BBSMSTR_000000000021" },
    { name: "광주테크노파크", url: "https://www.gjtp.or.kr/home/business.cs" },
    { name: "대전테크노파크", url: "https://www.djtp.or.kr/menu.es?mid=a20100000000" },
    { name: "포항테크노파크", url: "https://www.ptp.or.kr/main/board/index.do?menu_idx=116&manage_idx=15" },
    { name: "경기대진테크노파크", url: "https://gdtp.or.kr/board/announcement" },
    { name: "제주테크노파크", url: "https://www.jejutp.or.kr/board/business" },
  ];

  for (const { name, url } of sites) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[${name}]`);
    console.log(`URL: ${url}`);
    console.log("=".repeat(70));
    
    const page = await context.newPage();
    
    try {
      await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      
      // 테이블 구조 분석
      const tableAnalysis = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const results: any[] = [];
        
        tables.forEach((table, idx) => {
          const headers = Array.from(table.querySelectorAll('th, thead td'))
            .map(th => (th.textContent || '').trim())
            .filter(t => t.length > 0);
          
          const rows = table.querySelectorAll('tbody tr, tr');
          const rowData: string[] = [];
          
          rows.forEach((row, rowIdx) => {
            if (rowIdx < 3) { // 첫 3개 행만
              const cells = Array.from(row.querySelectorAll('td'))
                .map(td => (td.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50))
                .filter(t => t.length > 0);
              if (cells.length > 0) {
                rowData.push(cells.join(' | '));
              }
            }
          });
          
          if (headers.length > 0 || rowData.length > 0) {
            results.push({
              tableIdx: idx,
              className: table.className,
              headers: headers.slice(0, 8),
              rowCount: rows.length,
              sampleRows: rowData
            });
          }
        });
        
        return results;
      });
      
      // 리스트/카드 구조 분석
      const listAnalysis = await page.evaluate(() => {
        const selectors = [
          'ul.board-list li',
          '.board-list li',
          'ul.list li',
          '.list-item',
          '.card',
          '.item',
          '[class*="board"] li',
          '[class*="list"] > li',
          '[class*="list"] > div',
        ];
        
        const results: any[] = [];
        
        selectors.forEach(selector => {
          const items = document.querySelectorAll(selector);
          if (items.length > 0) {
            const samples: string[] = [];
            items.forEach((item, idx) => {
              if (idx < 2) {
                samples.push((item.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 100));
              }
            });
            results.push({ selector, count: items.length, samples });
          }
        });
        
        return results;
      });
      
      // 날짜 패턴 분석
      const datePatterns = await page.evaluate(() => {
        const html = document.body.innerText;
        const patterns = [
          /\d{4}-\d{2}-\d{2}/g,
          /\d{4}\.\d{2}\.\d{2}/g,
          /\d{2}-\d{2}-\d{2}/g,
          /\d{2}\.\d{2}\.\d{2}/g,
        ];
        
        const dates: string[] = [];
        patterns.forEach(p => {
          const matches = html.match(p);
          if (matches) {
            matches.slice(0, 5).forEach(m => {
              if (!dates.includes(m)) dates.push(m);
            });
          }
        });
        
        return dates.slice(0, 10);
      });
      
      // 결과 출력
      if (tableAnalysis.length > 0) {
        console.log("\n📋 테이블 구조:");
        tableAnalysis.forEach(t => {
          console.log(`  Table ${t.tableIdx} (class="${t.className}", ${t.rowCount} rows)`);
          if (t.headers.length > 0) {
            console.log(`    헤더: ${t.headers.join(' | ')}`);
          }
          t.sampleRows.forEach((row: string, idx: number) => {
            console.log(`    행${idx+1}: ${row.substring(0, 80)}...`);
          });
        });
      } else {
        console.log("\n📋 테이블 없음");
      }
      
      if (listAnalysis.length > 0) {
        console.log("\n📝 리스트/카드 구조:");
        listAnalysis.slice(0, 3).forEach(l => {
          console.log(`  ${l.selector}: ${l.count}개`);
          l.samples.forEach((s: string, idx: number) => {
            console.log(`    샘플${idx+1}: ${s.substring(0, 70)}...`);
          });
        });
      }
      
      if (datePatterns.length > 0) {
        console.log(`\n📅 날짜 패턴: ${datePatterns.join(', ')}`);
      }
      
    } catch (error: any) {
      console.log(`❌ 에러: ${error.message}`);
    }
    
    await page.close();
  }

  await browser.close();
}

main().catch(console.error);
