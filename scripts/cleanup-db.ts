/**
 * DB Cleanup Script
 * 1. 중복 파일 제거
 * 2. 깨진 파일명 복원
 *
 * 실행: npx tsx scripts/cleanup-db.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import iconv from "iconv-lite";

const prisma = new PrismaClient();

// ============================================
// 파일명 복원 유틸리티
// ============================================

function hasValidKorean(str: string): boolean {
  return /[\uAC00-\uD7AF]/.test(str) && !str.includes('�');
}

function isCorruptedFileName(fileName: string): boolean {
  // Pattern A: Separated Korean jamo
  const jamoPattern = /[\u3131-\u3163\u314F-\u3163]{2,}/;

  // Pattern B: Latin-1 UTF-8 corruption
  const latin1Pattern = /[ÃÂ]{2,}|Ã[\x80-\xBF]/;

  // Pattern C: Replacement character
  const replacementPattern = /\uFFFD/;

  // Pattern D: Chinese-looking characters
  const suspiciousChinesePattern = /[\u4E00-\u9FFF]{3,}/;

  // Pattern E: Extended corruption pattern - Korean syllables with rare vowel/consonant combinations
  // Characters like 혚, 혞, 혱, 혗, 쨀, 혶, 쨉, 짠, 쨋, 혻, 혵 etc.
  // These appear when UTF-8 bytes are decoded as CP949/EUC-KR
  const extendedCorruptionPattern = /[혚혞혱혗쨀혶쨉짠쨋혻혵혲혷혙혢짼짯쨍혩혰혮쩍혳혬쨔쨈혡혛쨌쩌쨊쨁짢짧짜짧짤짭짖쩐쩔쩜혰혫혜혝혟혤혯혼횁횃횅횆횉횊횋횎횏횐횑횒횓횔횕횖횗횘횙횚횛횜혮혯]/g;
  const hasExtendedCorruption = (fileName.match(extendedCorruptionPattern) || []).length >= 2;

  // Pattern F: Common mojibake patterns - consecutive unusual syllables
  // 챙혞, 챘혚, 챗쨀 type patterns (UTF-8 → CP949 misread)
  const mojibakePattern = /[챘챙챗챠챨챵챶챷챸챹챺챻챼챽챾챿쨀쨁쨂쨃쨄쨅쨆쨇쨈쨉쨊쨋쨌쨍쨎쨏]/g;
  const hasMojibake = (fileName.match(mojibakePattern) || []).length >= 2;

  return jamoPattern.test(fileName) ||
         latin1Pattern.test(fileName) ||
         replacementPattern.test(fileName) ||
         suspiciousChinesePattern.test(fileName) ||
         hasExtendedCorruption ||
         hasMojibake;
}

function repairCorruptedFileName(fileName: string): string {
  // Strategy 0 (PRIORITY): Double encoding - CP949 → UTF-8 → Latin-1 → UTF-8
  // This handles the most common case: 챘혚혙 → 년 type corruption
  try {
    const cp949Bytes = iconv.encode(fileName, "cp949");
    const step1 = cp949Bytes.toString("utf-8");
    const latin1Bytes = Buffer.from(step1, "latin1");
    const final = latin1Bytes.toString("utf-8");
    if (hasValidKorean(final) && !isCorruptedFileName(final)) {
      return final;
    }
  } catch {
    // Continue
  }

  // Strategy 1: Latin-1 → UTF-8
  try {
    let isLatin1Range = true;
    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        isLatin1Range = false;
        break;
      }
    }

    if (isLatin1Range) {
      const bytes = Buffer.from(fileName, 'latin1');
      const utf8Decoded = bytes.toString('utf-8');
      if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
        return utf8Decoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 2: EUC-KR reverse
  try {
    const eucKrBytes = iconv.encode(fileName, 'euc-kr');
    const utf8Decoded = eucKrBytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      return utf8Decoded;
    }
  } catch {
    // Continue
  }

  // Strategy 3: Double encoding recovery (EUC-KR variant)
  try {
    const eucKrBytes = iconv.encode(fileName, "euc-kr");
    const step1 = eucKrBytes.toString("utf-8");
    const latin1Bytes = Buffer.from(step1, "latin1");
    const final = latin1Bytes.toString("utf-8");
    if (hasValidKorean(final) && !isCorruptedFileName(final)) {
      return final;
    }
  } catch {
    // Continue
  }

  // Strategy 4: Double encoding recovery (bytes)
  try {
    let allInRange = true;
    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        allInRange = false;
        break;
      }
    }

    if (allInRange) {
      const bytes = Buffer.from(fileName, 'latin1');

      const eucKrDecoded = iconv.decode(bytes, 'euc-kr');
      if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
        return eucKrDecoded;
      }

      const cp949Decoded = iconv.decode(bytes, 'cp949');
      if (hasValidKorean(cp949Decoded) && !isCorruptedFileName(cp949Decoded)) {
        return cp949Decoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 5: UTF-8 → EUC-KR
  try {
    const utf8Bytes = Buffer.from(fileName, 'utf-8');
    const eucKrDecoded = iconv.decode(utf8Bytes, 'euc-kr');
    if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
      return eucKrDecoded;
    }
  } catch {
    // Continue
  }

  // Strategy 6: CP949 → UTF-8 reverse
  try {
    const cp949Bytes = iconv.encode(fileName, 'cp949');
    const utf8Decoded = cp949Bytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      return utf8Decoded;
    }
  } catch {
    // Continue
  }

  return fileName;
}

// ============================================
// 메인 실행
// ============================================

async function main() {
  console.log("=".repeat(60));
  console.log("DB Cleanup Script");
  console.log("=".repeat(60));

  // ============================================
  // Step 1: 중복 파일 확인 및 제거
  // ============================================
  console.log("\n📦 Step 1: 중복 파일 확인...");

  const attachments = await prisma.projectAttachment.findMany({
    select: {
      id: true,
      projectId: true,
      fileName: true,
      sourceUrl: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`  총 첨부파일: ${attachments.length}개`);

  // Group by (projectId, sourceUrl)
  const groups = new Map<string, typeof attachments>();

  for (const attachment of attachments) {
    const key = `${attachment.projectId}:${attachment.sourceUrl}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(attachment);
  }

  // Find duplicates
  const idsToDelete: string[] = [];
  let duplicateGroups = 0;

  for (const [, group] of groups.entries()) {
    if (group.length > 1) {
      duplicateGroups++;
      // Keep the most recent (first in array)
      const deleteIds = group.slice(1).map(a => a.id);
      idsToDelete.push(...deleteIds);
    }
  }

  console.log(`  중복 그룹: ${duplicateGroups}개`);
  console.log(`  삭제 대상: ${idsToDelete.length}개`);

  if (idsToDelete.length > 0) {
    console.log("\n  🗑️  중복 파일 삭제 중...");
    const result = await prisma.projectAttachment.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });
    console.log(`  ✅ ${result.count}개 중복 파일 삭제 완료`);
  } else {
    console.log("  ✅ 중복 파일 없음");
  }

  // ============================================
  // Step 2: 깨진 파일명 확인 및 복원
  // ============================================
  console.log("\n📝 Step 2: 깨진 파일명 확인...");

  // Reload attachments after deletion
  const remainingAttachments = await prisma.projectAttachment.findMany({
    select: {
      id: true,
      fileName: true,
    },
  });

  console.log(`  남은 첨부파일: ${remainingAttachments.length}개`);

  const corrupted: Array<{ id: string; original: string; repaired: string }> = [];

  for (const attachment of remainingAttachments) {
    if (isCorruptedFileName(attachment.fileName)) {
      const repaired = repairCorruptedFileName(attachment.fileName);
      if (repaired !== attachment.fileName && hasValidKorean(repaired)) {
        corrupted.push({
          id: attachment.id,
          original: attachment.fileName,
          repaired,
        });
      }
    }
  }

  console.log(`  깨진 파일명 (복원 가능): ${corrupted.length}개`);

  if (corrupted.length > 0) {
    console.log("\n  🔧 파일명 복원 중...");

    for (const item of corrupted) {
      console.log(`    "${item.original}" → "${item.repaired}"`);
      await prisma.projectAttachment.update({
        where: { id: item.id },
        data: { fileName: item.repaired },
      });
    }

    console.log(`  ✅ ${corrupted.length}개 파일명 복원 완료`);
  } else {
    console.log("  ✅ 복원 가능한 깨진 파일명 없음");
  }

  // ============================================
  // 최종 결과
  // ============================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 정리 완료!");
  console.log("=".repeat(60));
  console.log(`  중복 파일 삭제: ${idsToDelete.length}개`);
  console.log(`  파일명 복원: ${corrupted.length}개`);

  // 현재 상태 출력
  const finalCount = await prisma.projectAttachment.count();
  console.log(`  현재 총 첨부파일: ${finalCount}개`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
