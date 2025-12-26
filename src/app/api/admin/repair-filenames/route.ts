/**
 * Admin API: Repair Corrupted Filenames
 * POST /api/admin/repair-filenames
 *
 * Scans ProjectAttachment table for corrupted Korean filenames
 * and attempts to repair them using multiple decoding strategies
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";
import iconv from "iconv-lite";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "admin-repair-filenames" });

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

  // Pattern D: Chinese-looking characters that shouldn't be in Korean filenames
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

/**
 * Attempt to repair a corrupted filename
 */
function repairCorruptedFileName(fileName: string): string {
  // Strategy 0 (PRIORITY): Double encoding - CP949 → UTF-8 → Latin-1 → UTF-8
  // This handles the most common case: 챘혚혙 → 년 type corruption
  // UTF-8 bytes were wrongly decoded as CP949, then displayed incorrectly
  try {
    const cp949Bytes = iconv.encode(fileName, "cp949");
    const step1 = cp949Bytes.toString("utf-8");
    const latin1Bytes = Buffer.from(step1, "latin1");
    const final = latin1Bytes.toString("utf-8");
    if (hasValidKorean(final) && !isCorruptedFileName(final)) {
      return final;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 1: Latin-1 → UTF-8 (most common for Ã patterns)
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
    // Continue to next strategy
  }

  // Strategy 2: Try to recover from EUC-KR misinterpretation
  try {
    const eucKrBytes = iconv.encode(fileName, 'euc-kr');
    const utf8Decoded = eucKrBytes.toString('utf-8');
    if (hasValidKorean(utf8Decoded) && !isCorruptedFileName(utf8Decoded)) {
      return utf8Decoded;
    }
  } catch {
    // Continue to next strategy
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

      // Try EUC-KR decode
      const eucKrDecoded = iconv.decode(bytes, 'euc-kr');
      if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
        return eucKrDecoded;
      }

      // Try CP949 decode
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

  // No repair successful
  return fileName;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    logger.info(`Starting ${dryRun ? 'DRY RUN' : 'ACTUAL REPAIR'}...`);

    // Get all attachments
    const attachments = await prisma.projectAttachment.findMany({
      select: {
        id: true,
        fileName: true,
        projectId: true,
      },
    });

    logger.info(`Found ${attachments.length} attachments`);

    const results = {
      total: attachments.length,
      corrupted: 0,
      repaired: 0,
      failed: 0,
      unchanged: 0,
      details: [] as Array<{
        id: string;
        original: string;
        repaired: string | null;
        status: 'repaired' | 'failed' | 'unchanged';
      }>,
    };

    for (const attachment of attachments) {
      const { id, fileName } = attachment;

      if (isCorruptedFileName(fileName)) {
        results.corrupted++;

        const repaired = repairCorruptedFileName(fileName);

        if (repaired !== fileName && hasValidKorean(repaired)) {
          // Successfully repaired
          if (!dryRun) {
            await prisma.projectAttachment.update({
              where: { id },
              data: { fileName: repaired },
            });
          }

          results.repaired++;
          results.details.push({
            id,
            original: fileName,
            repaired,
            status: 'repaired',
          });

          logger.info(`Repaired: ${fileName} → ${repaired}`);
        } else {
          // Could not repair
          results.failed++;
          results.details.push({
            id,
            original: fileName,
            repaired: null,
            status: 'failed',
          });

          logger.warn(`Failed to repair: ${fileName}`);
        }
      } else {
        results.unchanged++;
      }
    }

    logger.info("Repair filenames complete", {
      total: results.total,
      corrupted: results.corrupted,
      repaired: results.repaired,
      failed: results.failed,
      unchanged: results.unchanged,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        total: results.total,
        corrupted: results.corrupted,
        repaired: results.repaired,
        failed: results.failed,
        unchanged: results.unchanged,
      },
      details: results.details,
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}

// GET endpoint to check corrupted filenames without modifying
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const attachments = await prisma.projectAttachment.findMany({
      select: {
        id: true,
        fileName: true,
        projectId: true,
      },
    });

    const corrupted = attachments.filter(a => isCorruptedFileName(a.fileName));

    return NextResponse.json({
      total: attachments.length,
      corrupted: corrupted.length,
      corruptedFiles: corrupted.map(a => ({
        id: a.id,
        fileName: a.fileName,
        projectId: a.projectId,
        suggestedRepair: repairCorruptedFileName(a.fileName),
      })),
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
