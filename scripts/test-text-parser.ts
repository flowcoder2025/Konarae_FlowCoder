#!/usr/bin/env npx tsx
/**
 * text_parser API 테스트 스크립트
 */

import { prisma } from "../src/lib/prisma";
import axios from "axios";
import { parseDocument } from "../src/lib/document-parser";

async function test() {
  console.log("=== text_parser API 테스트 ===\n");

  // 이전에 500 에러가 났던 파일 하나 테스트
  const file = await prisma.projectAttachment.findFirst({
    where: {
      isParsed: false,
      shouldParse: true,
      fileType: "hwp"
    },
    select: { id: true, fileName: true, sourceUrl: true, fileType: true }
  });

  if (!file) {
    console.log("테스트할 파일 없음");
    return;
  }

  console.log("테스트 파일:", file.fileName);

  try {
    const response = await axios.get(file.sourceUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const buffer = Buffer.from(response.data);
    console.log("다운로드 완료:", (buffer.length / 1024).toFixed(1), "KB");

    const result = await parseDocument(buffer, "hwp");

    if (result.success) {
      console.log("✅ 파싱 성공:", result.text?.length, "자");
      console.log("샘플:", result.text?.slice(0, 200));
    } else {
      console.log("❌ 파싱 실패:", result.error);
    }
  } catch (e: any) {
    console.log("❌ 에러:", e.message);
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
