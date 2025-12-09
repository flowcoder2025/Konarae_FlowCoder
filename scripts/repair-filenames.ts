/**
 * Repair Corrupted Filenames Script
 *
 * Run with: npx tsx scripts/repair-filenames.ts
 * Dry run:  npx tsx scripts/repair-filenames.ts --dry-run
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import iconv from "iconv-lite";

const prisma = new PrismaClient();

/**
 * Check if a string contains valid Korean characters
 */
function hasValidKorean(str: string): boolean {
  return /[\uAC00-\uD7AF]/.test(str) && !str.includes('�');
}

/**
 * Check if filename appears corrupted
 */
function isCorruptedFileName(fileName: string): boolean {
  // Pattern A: Separated Korean jamo
  const jamoPattern = /[\u3131-\u3163\u314F-\u3163]{2,}/;

  // Pattern B: Latin-1 UTF-8 corruption (Ã, Â appearing together)
  const latin1Pattern = /[ÃÂ]{2,}|Ã[\x80-\xBF]/;

  // Pattern C: Replacement character
  const replacementPattern = /\uFFFD/;

  // Pattern D: Chinese-looking characters
  const suspiciousChinesePattern = /[\u4E00-\u9FFF]{3,}/;

  // Pattern E: Specific corruption pattern (챘쨋 type)
  const specificCorruptionPattern = /[챘쨋혲혷혙혢혻짼짯혵혶]{2,}/;

  return jamoPattern.test(fileName) ||
         latin1Pattern.test(fileName) ||
         replacementPattern.test(fileName) ||
         suspiciousChinesePattern.test(fileName) ||
         specificCorruptionPattern.test(fileName);
}

/**
 * Attempt to repair a corrupted filename
 * Handles multiple corruption patterns:
 * - Pattern A (챘쨋 type): UTF-8 bytes read as EUC-KR, then stored as UTF-8
 * - Pattern B (Ã type): UTF-8 bytes read as Latin-1, stored as UTF-8 (possibly double)
 */
function repairCorruptedFileName(fileName: string): string {
  // Strategy 1: Double UTF-8 encoding via Latin-1 (most common for Ã pattern)
  // Path: UTF-8 → Latin-1 → UTF-8 → Latin-1 → UTF-8
  // To reverse: Latin-1 encode → UTF-8 decode → Latin-1 encode → UTF-8 decode
  try {
    let isLatin1Range = true;
    for (let i = 0; i < fileName.length; i++) {
      if (fileName.charCodeAt(i) > 255) {
        isLatin1Range = false;
        break;
      }
    }

    if (isLatin1Range) {
      // First round: Latin-1 → UTF-8
      const bytes1 = Buffer.from(fileName, 'latin1');
      const step1 = bytes1.toString('utf-8');

      // Check if step1 is valid
      if (hasValidKorean(step1) && !isCorruptedFileName(step1)) {
        return step1;
      }

      // Second round: if step1 is still Latin-1 range, decode again
      let step1Latin1 = true;
      for (let i = 0; i < step1.length; i++) {
        if (step1.charCodeAt(i) > 255) {
          step1Latin1 = false;
          break;
        }
      }

      if (step1Latin1) {
        const bytes2 = Buffer.from(step1, 'latin1');
        const step2 = bytes2.toString('utf-8');
        if (hasValidKorean(step2) && !isCorruptedFileName(step2)) {
          return step2;
        }
      }
    }
  } catch {
    // Continue
  }

  // Strategy 2: EUC-KR → UTF-8 misinterpretation (챘쨋 pattern)
  // Original UTF-8 was interpreted as EUC-KR then re-encoded as UTF-8
  // To reverse: UTF-8 decode to get EUC-KR bytes → re-interpret as UTF-8
  try {
    // The current string is UTF-8. When decoded, we get what was meant to be EUC-KR bytes.
    // So encode as EUC-KR to get those bytes, then decode as UTF-8
    const asEucKr = iconv.encode(fileName, 'euc-kr');
    const asUtf8 = asEucKr.toString('utf-8');
    if (hasValidKorean(asUtf8) && !isCorruptedFileName(asUtf8)) {
      return asUtf8;
    }
  } catch {
    // Continue
  }

  // Strategy 3: CP949 → UTF-8 misinterpretation
  try {
    const asCp949 = iconv.encode(fileName, 'cp949');
    const asUtf8 = asCp949.toString('utf-8');
    if (hasValidKorean(asUtf8) && !isCorruptedFileName(asUtf8)) {
      return asUtf8;
    }
  } catch {
    // Continue
  }

  // Strategy 4: Latin-1 → EUC-KR (for files from older systems)
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
      const eucKrDecoded = iconv.decode(bytes, 'euc-kr');
      if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
        return eucKrDecoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 5: For 챘쨋 pattern - these might be UTF-8 bytes stored in DB as-is
  // but displayed incorrectly. Try raw byte manipulation.
  try {
    // Get the raw bytes of the UTF-8 string
    const utf8Bytes = Buffer.from(fileName, 'utf-8');

    // Try to decode these bytes as if they were EUC-KR originally
    // (i.e., the UTF-8 encoding process happened on EUC-KR bytes)
    const eucKrDecoded = iconv.decode(utf8Bytes, 'euc-kr');
    if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
      return eucKrDecoded;
    }

    // Also try CP949
    const cp949Decoded = iconv.decode(utf8Bytes, 'cp949');
    if (hasValidKorean(cp949Decoded) && !isCorruptedFileName(cp949Decoded)) {
      return cp949Decoded;
    }
  } catch {
    // Continue
  }

  // Strategy 6: Triple encoding recovery (very rare but possible)
  try {
    let current = fileName;
    for (let i = 0; i < 3; i++) {
      let isLatin1 = true;
      for (let j = 0; j < current.length; j++) {
        if (current.charCodeAt(j) > 255) {
          isLatin1 = false;
          break;
        }
      }
      if (!isLatin1) break;

      const bytes = Buffer.from(current, 'latin1');
      current = bytes.toString('utf-8');

      if (hasValidKorean(current) && !isCorruptedFileName(current)) {
        return current;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 7: 챘쨋 pattern - UTF-8 Korean misread as CP949, stored as UTF-8
  // The corrupted characters are what you get when UTF-8 bytes are read as CP949
  // To reverse: encode CP949 → get original UTF-8 bytes
  try {
    // For each character in the corrupted string, find its CP949 byte representation
    // Then interpret those bytes as UTF-8
    const cp949Bytes = iconv.encode(fileName, 'cp949');

    // Check if resulting bytes form valid UTF-8
    const decoded = cp949Bytes.toString('utf-8');
    if (hasValidKorean(decoded) && !isCorruptedFileName(decoded)) {
      return decoded;
    }
  } catch {
    // Continue
  }

  // Strategy 8: Double EUC-KR encoding
  // UTF-8 → read as EUC-KR → encode as UTF-8 → read as EUC-KR → encode as UTF-8
  // To reverse: EUC-KR encode → UTF-8 decode → EUC-KR encode → UTF-8 decode
  try {
    let current = fileName;
    for (let i = 0; i < 2; i++) {
      const encoded = iconv.encode(current, 'euc-kr');
      current = encoded.toString('utf-8');

      if (hasValidKorean(current) && !isCorruptedFileName(current)) {
        return current;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 9: UTF-8 BOM and encoding issues
  // Sometimes files have UTF-8 BOM but are read with wrong encoding
  try {
    const withoutBom = fileName.replace(/^\uFEFF/, '');
    if (withoutBom !== fileName) {
      const bytes = Buffer.from(withoutBom, 'utf-8');
      const decoded = iconv.decode(bytes, 'utf-8');
      if (hasValidKorean(decoded) && !isCorruptedFileName(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 10: Mixed encoding - UTF-8 interpreted as various Windows codepages
  const codepages = ['cp1252', 'cp1250', 'cp936', 'gbk'];
  for (const codepage of codepages) {
    try {
      const encoded = iconv.encode(fileName, codepage);
      const decoded = encoded.toString('utf-8');
      if (hasValidKorean(decoded) && !isCorruptedFileName(decoded)) {
        return decoded;
      }
    } catch {
      // Continue
    }
  }

  // Strategy 11: For 챘쨋 pattern - Character-by-character recovery
  // Some Korean characters in the 0xCC-0xCF range (챘, 쨋, etc.) might be
  // the result of specific byte sequences being misinterpreted
  try {
    const utf8Bytes = Buffer.from(fileName, 'utf-8');

    // Try interpreting as EUC-KR first, then if that gives us Latin-1 range chars,
    // try another round of decoding
    const eucKrDecoded = iconv.decode(utf8Bytes, 'euc-kr');

    // Check if result is in Latin-1 range for further processing
    let allLatin1 = true;
    for (let i = 0; i < eucKrDecoded.length; i++) {
      if (eucKrDecoded.charCodeAt(i) > 255) {
        allLatin1 = false;
        break;
      }
    }

    if (allLatin1) {
      const bytes = Buffer.from(eucKrDecoded, 'latin1');
      const finalDecoded = bytes.toString('utf-8');
      if (hasValidKorean(finalDecoded) && !isCorruptedFileName(finalDecoded)) {
        return finalDecoded;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 12: Reverse of common browser/database corruption
  // UTF-8 → stored as Latin-1 bytes in DB → read as UTF-8
  // This creates chars like 챘 from original Korean
  try {
    // Get the corrupted string's code points and try to map back
    const bytes: number[] = [];
    for (let i = 0; i < fileName.length; i++) {
      const char = fileName.charCodeAt(i);
      // For high-range Korean syllables (U+AC00-U+D7AF range seen as corrupted)
      // Try extracting potential original UTF-8 bytes
      if (char >= 0xAC00 && char <= 0xD7AF) {
        // UTF-8 encoding of this Korean char
        const utfBytes = Buffer.from(fileName.charAt(i), 'utf-8');
        bytes.push(...utfBytes);
      } else {
        // For other characters, keep as-is in bytes
        if (char < 256) {
          bytes.push(char);
        } else {
          const utfBytes = Buffer.from(fileName.charAt(i), 'utf-8');
          bytes.push(...utfBytes);
        }
      }
    }

    // Now try to decode these bytes as if they were the original
    const buffer = Buffer.from(bytes);

    // Try EUC-KR interpretation
    const decoded = iconv.decode(buffer, 'euc-kr');
    if (hasValidKorean(decoded) && !isCorruptedFileName(decoded)) {
      return decoded;
    }
  } catch {
    // Continue
  }

  return fileName;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`\n🔧 Filename Repair Script`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'ACTUAL REPAIR'}`);
  console.log('─'.repeat(50));

  try {
    // Get all attachments
    const attachments = await prisma.projectAttachment.findMany({
      select: {
        id: true,
        fileName: true,
        projectId: true,
      },
    });

    console.log(`\n📊 Found ${attachments.length} attachments\n`);

    let corrupted = 0;
    let repaired = 0;
    let failed = 0;

    for (const attachment of attachments) {
      const { id, fileName } = attachment;

      if (isCorruptedFileName(fileName)) {
        corrupted++;

        const repairedName = repairCorruptedFileName(fileName);

        if (repairedName !== fileName && hasValidKorean(repairedName)) {
          console.log(`✅ REPAIR:`);
          console.log(`   Before: ${fileName}`);
          console.log(`   After:  ${repairedName}`);

          if (!dryRun) {
            await prisma.projectAttachment.update({
              where: { id },
              data: { fileName: repairedName },
            });
          }

          repaired++;
        } else {
          console.log(`❌ FAILED:`);
          console.log(`   File:   ${fileName}`);
          console.log(`   Tried:  ${repairedName}`);
          failed++;
        }
        console.log('');
      }
    }

    console.log('─'.repeat(50));
    console.log(`\n📈 Summary:`);
    console.log(`   Total attachments: ${attachments.length}`);
    console.log(`   Corrupted found:   ${corrupted}`);
    console.log(`   Successfully repaired: ${repaired}`);
    console.log(`   Failed to repair:  ${failed}`);
    console.log(`   Normal (unchanged): ${attachments.length - corrupted}`);

    if (dryRun && repaired > 0) {
      console.log(`\n⚠️  This was a DRY RUN. To actually repair, run without --dry-run`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
