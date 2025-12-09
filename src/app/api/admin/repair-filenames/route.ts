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

  // Pattern E: Check for "챘", "쨋" type characters (specific corruption pattern)
  const specificCorruptionPattern = /[챘쨋혲혷혙혢혻짼짯혵혶]{2,}/;

  return jamoPattern.test(fileName) ||
         latin1Pattern.test(fileName) ||
         replacementPattern.test(fileName) ||
         suspiciousChinesePattern.test(fileName) ||
         specificCorruptionPattern.test(fileName);
}

/**
 * Attempt to repair a corrupted filename
 */
function repairCorruptedFileName(fileName: string): string {
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

  // Strategy 3: Double encoding recovery
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

  // Strategy 4: For 챘쨋 type corruption - try UTF-8 bytes interpreted as something else
  try {
    // Encode as UTF-8, then try various decodings
    const utf8Bytes = Buffer.from(fileName, 'utf-8');

    // Try EUC-KR interpretation
    const eucKrDecoded = iconv.decode(utf8Bytes, 'euc-kr');
    if (hasValidKorean(eucKrDecoded) && !isCorruptedFileName(eucKrDecoded)) {
      return eucKrDecoded;
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

    console.log(`[Repair Filenames] Starting ${dryRun ? 'DRY RUN' : 'ACTUAL REPAIR'}...`);

    // Get all attachments
    const attachments = await prisma.projectAttachment.findMany({
      select: {
        id: true,
        fileName: true,
        projectId: true,
      },
    });

    console.log(`[Repair Filenames] Found ${attachments.length} attachments`);

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

          console.log(`[Repair] ${fileName} → ${repaired}`);
        } else {
          // Could not repair
          results.failed++;
          results.details.push({
            id,
            original: fileName,
            repaired: null,
            status: 'failed',
          });

          console.log(`[Failed] ${fileName} - could not repair`);
        }
      } else {
        results.unchanged++;
      }
    }

    console.log(`[Repair Filenames] Complete:`, {
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
