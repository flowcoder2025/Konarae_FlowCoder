#!/usr/bin/env npx tsx
/**
 * 발견 0건 사이트 HTML 구조 분석
 */
import { chromium } from "playwright";

interface AnalysisResult {
  name: string;
  url: string;
  status: number;
  htmlSize: number;
  tables: number;
  rows: number;
  listItems: number;
  divCards: number;
  links: number;
  structure: string;
  sampleContent: string;
}

async function main() {
  console.log("=== 발견 0건 사이트 HTML 구조 분석 ===\n");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  // 발견 0건인 사이트들
  const sites = [
    { name: "경기대진테크노파크", url: "https://gdtp.or.kr/board/announcement" },
    { name: "경기테크노파크", url: "https://pms.gtp.or.kr/web/business/webBusinessList.do" },
    { name: "경남테크노파크", url: "https://www.gntp.or.kr/sub05/sub01.asp" },
    { name: "경북테크노파크", url: "https://www.gbtp.or.kr/user/board.do?bbsId=BBSMSTR_000000000021" },
    { name: "광주테크노파크", url: "https://www.gjtp.or.kr/home/business.cs" },
    { name: "대구테크노파크", url: "https://www.dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003" },
    { name: "대전테크노파크", url: "https://www.djtp.or.kr/menu.es?mid=a20100000000" },
    { name: "서울테크노파크", url: "https://www.seoultp.or.kr/user/nd19746.do" },
    { name: "세종테크노파크", url: "https://www.sjtp.or.kr/board/list.do?boardId=notice" },
    { name: "울산테크노파크", url: "https://www.utp.or.kr/board/list.do?boardId=notice" },
    { name: "인천테크노파크", url: "https://itp.or.kr/intro.asp?tmid=13" },
    { name: "전남테크노파크", url: "https://www.jntp.or.kr/base/board/list?boardManagementNo=11&menuLevel=2&menuNo=44" },
    { name: "전북테크노파크", url: "https://rnd.jbtp.or.kr/pms/bus/pjt_pblanc_list_mb.jsp" },
    { name: "제주테크노파크", url: "https://www.jejutp.or.kr/board/business" },
    { name: "충남테크노파크", url: "https://www.ctp.or.kr/board/list.do?boardId=BOARD_000000000000001" },
    { name: "포항테크노파크", url: "https://www.ptp.or.kr/main/board/index.do?menu_idx=116&manage_idx=15" },
  ];

  const results: AnalysisResult[] = [];

  for (const { name, url } of sites) {
    const page = await context.newPage();
    
    try {
      const response = await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      
      const status = response?.status() || 0;
      const html = await page.content();
      
      // 구조 분석
      const analysis = await page.evaluate(() => {
        const tables = document.querySelectorAll('table').length;
        const rows = document.querySelectorAll('tr').length;
        const listItems = document.querySelectorAll('li').length;
        const divCards = document.querySelectorAll('.card, .item, .list-item, [class*="board"], [class*="list"]').length;
        const links = document.querySelectorAll('a[href]').length;
        
        // 게시판 구조 감지
        let structure = 'unknown';
        if (tables > 0 && rows > 5) structure = 'table';
        else if (document.querySelectorAll('ul.board-list, ul.list, .board-list').length > 0) structure = 'ul-list';
        else if (document.querySelectorAll('.card, .item, .board-item').length > 0) structure = 'card';
        else if (document.querySelectorAll('[class*="vue"], [data-v-]').length > 0) structure = 'vue-spa';
        else if (document.querySelectorAll('[class*="react"], [data-reactroot]').length > 0) structure = 'react-spa';
        
        // 샘플 콘텐츠 추출
        let sampleContent = '';
        const boardTable = document.querySelector('table.board, table.list, .board-list table, table');
        if (boardTable) {
          const firstRow = boardTable.querySelector('tbody tr, tr:nth-child(2)');
          if (firstRow) {
            sampleContent = (firstRow.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 150);
          }
        }
        
        if (!sampleContent) {
          const listItem = document.querySelector('.board-list li, ul.list li, .item, .card');
          if (listItem) {
            sampleContent = (listItem.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 150);
          }
        }
        
        return { tables, rows, listItems, divCards, links, structure, sampleContent };
      });
      
      results.push({
        name,
        url,
        status,
        htmlSize: html.length,
        ...analysis
      });
      
    } catch (error: any) {
      results.push({
        name,
        url,
        status: 0,
        htmlSize: 0,
        tables: 0,
        rows: 0,
        listItems: 0,
        divCards: 0,
        links: 0,
        structure: 'error',
        sampleContent: error.message.substring(0, 100)
      });
    }
    
    await page.close();
  }

  await browser.close();

  // 결과 출력
  console.log("=" .repeat(80));
  console.log("📊 HTML 구조 분석 결과");
  console.log("=".repeat(80));
  
  // 구조 유형별 그룹화
  const byStructure: Record<string, AnalysisResult[]> = {};
  results.forEach(r => {
    if (!byStructure[r.structure]) byStructure[r.structure] = [];
    byStructure[r.structure].push(r);
  });

  for (const [structure, sites] of Object.entries(byStructure)) {
    console.log(`\n### ${structure.toUpperCase()} 구조 (${sites.length}개)`);
    console.log("-".repeat(80));
    
    for (const r of sites) {
      console.log(`\n[${r.name}]`);
      console.log(`  URL: ${r.url}`);
      console.log(`  상태: ${r.status} | HTML: ${(r.htmlSize/1024).toFixed(0)}KB`);
      console.log(`  테이블: ${r.tables} | 행: ${r.rows} | 리스트: ${r.listItems} | 카드: ${r.divCards}`);
      if (r.sampleContent) {
        console.log(`  샘플: "${r.sampleContent.substring(0, 80)}..."`);
      }
    }
  }

  // 요약
  console.log("\n" + "=".repeat(80));
  console.log("📋 파서 개선 권장 사항");
  console.log("=".repeat(80));
  
  const tableStructure = results.filter(r => r.structure === 'table' && r.rows > 5);
  const spaStructure = results.filter(r => r.structure.includes('spa') || r.structure === 'vue-spa');
  const unknownStructure = results.filter(r => r.structure === 'unknown');
  
  if (tableStructure.length > 0) {
    console.log(`\n✅ 테이블 구조 (파싱 가능): ${tableStructure.length}개`);
    tableStructure.forEach(r => console.log(`   - ${r.name} (${r.rows} rows)`));
  }
  
  if (spaStructure.length > 0) {
    console.log(`\n⚠️ SPA 구조 (JS 렌더링 필요): ${spaStructure.length}개`);
    spaStructure.forEach(r => console.log(`   - ${r.name}`));
  }
  
  if (unknownStructure.length > 0) {
    console.log(`\n❓ 알 수 없는 구조 (수동 확인 필요): ${unknownStructure.length}개`);
    unknownStructure.forEach(r => console.log(`   - ${r.name} (tables: ${r.tables}, rows: ${r.rows})`));
  }
}

main().catch(console.error);
