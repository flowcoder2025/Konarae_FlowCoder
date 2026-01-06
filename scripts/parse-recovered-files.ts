#!/usr/bin/env npx tsx
/**
 * 복구된 파일 텍스트 파싱 스크립트
 */

import { prisma } from "../src/lib/prisma";
import axios from "axios";
import { parseDocument } from "../src/lib/document-parser";

function removeJsessionId(url: string): string {
  return url.replace(/;jsessionid=[^?&]*/gi, "");
}

function extractPdfFromViewerUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname.includes("viewer")) {
      const fileParam = urlObj.searchParams.get("file");
      if (fileParam?.startsWith("/")) {
        return `${urlObj.protocol}//${urlObj.host}${fileParam.split("#")[0]}`;
      }
    }
  } catch {}
  return null;
}

function normalizeUrl(url: string): string {
  const pdfUrl = extractPdfFromViewerUrl(url);
  if (pdfUrl) return pdfUrl;
  return removeJsessionId(url);
}

async function parseRecoveredFiles() {
  console.log("=== 복구된 파일 텍스트 파싱 ===\n");

  // 파싱 대상 파일 조회 (isParsed가 false이고 shouldParse가 true)
  // parseError가 있어도 재시도 (다운로드 복구된 파일 포함)
  const recovered = await prisma.projectAttachment.findMany({
    where: {
      isParsed: false,
      shouldParse: true
    },
    select: {
      id: true,
      fileName: true,
      sourceUrl: true,
      fileType: true
    }
  });

  console.log(`📊 파싱 대상: ${recovered.length}건\n`);

  let success = 0;
  let fail = 0;

  for (const file of recovered) {
    const cleanUrl = normalizeUrl(file.sourceUrl);
    const fileType = file.fileType as "pdf" | "hwp" | "hwpx";

    if (fileType !== "pdf" && fileType !== "hwp" && fileType !== "hwpx") {
      console.log(`⏭️ ${file.fileName.slice(0, 40)} - 지원하지 않는 형식 (${fileType})`);
      continue;
    }

    try {
      // 파일 다운로드
      const response = await axios.get(cleanUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      const buffer = Buffer.from(response.data);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

      // 텍스트 파싱
      const result = await parseDocument(buffer, fileType);

      if (result.success && result.text && result.text.length > 100) {
        await prisma.projectAttachment.update({
          where: { id: file.id },
          data: {
            isParsed: true,
            parsedContent: result.text.slice(0, 50000), // 50KB 제한
            parseError: null
          }
        });
        console.log(`✅ ${file.fileName.slice(0, 40)} - ${sizeMB}MB → ${result.text.length}자`);
        success++;
      } else {
        const error = result.error || "No text extracted";
        await prisma.projectAttachment.update({
          where: { id: file.id },
          data: { parseError: error }
        });
        console.log(`❌ ${file.fileName.slice(0, 40)} - ${error.slice(0, 30)}`);
        fail++;
      }
    } catch (error: any) {
      await prisma.projectAttachment.update({
        where: { id: file.id },
        data: { parseError: error.message?.slice(0, 200) }
      });
      console.log(`❌ ${file.fileName.slice(0, 40)} - ${error.message?.slice(0, 30)}`);
      fail++;
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`✅ 파싱 성공: ${success}건`);
  console.log(`❌ 파싱 실패: ${fail}건`);

  // 최종 통계
  const totalParsed = await prisma.projectAttachment.count({ where: { isParsed: true } });
  const totalTarget = await prisma.projectAttachment.count({ where: { shouldParse: true } });
  console.log(`\n📊 전체 파싱률: ${totalParsed}/${totalTarget} (${((totalParsed/totalTarget)*100).toFixed(1)}%)`);
}

parseRecoveredFiles().catch(console.error).finally(() => prisma.$disconnect());
