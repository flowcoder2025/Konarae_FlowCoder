/**
 * Pipeline Parse API
 * POST /api/admin/pipeline/parse
 *
 * Triggers parsing retry for failed attachments
 * Can specify batch size and filter by error type
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDocument } from "@/lib/document-parser";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

interface ParseRequest {
  batchSize?: number;
  errorType?: string; // Filter by specific error type
  fileIds?: string[]; // Specific file IDs to retry
}

interface ParseResult {
  jobId: string;
  processed: number;
  success: number;
  failed: number;
  details: Array<{
    id: string;
    fileName: string;
    status: "success" | "failed" | "skipped";
    message?: string;
  }>;
}

/**
 * Detect file type from buffer magic bytes
 */
function detectFileType(buffer: Buffer): "pdf" | "hwp" | "hwpx" | "unknown" {
  if (buffer.length < 8) return "unknown";

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "pdf";
  }

  // HWP: D0 CF 11 E0 (OLE Compound Document)
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return "hwp";
  }

  // HWPX/ZIP: PK (50 4B)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "hwpx";
  }

  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseRequest = await req.json();
    const { batchSize = 20, errorType, fileIds } = body;

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create pipeline job record
    const pipelineJob = await prisma.pipelineJob.create({
      data: {
        type: "parse",
        status: "running",
        triggeredBy: "manual",
        params: { batchSize, errorType, fileIds },
        startedAt: new Date(),
      },
    });

    // Build query for unparsed files
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {
      shouldParse: true,
      isParsed: false,
    };

    if (fileIds && fileIds.length > 0) {
      whereClause.id = { in: fileIds };
    }

    // Get files to process
    const unparsedFiles = await prisma.projectAttachment.findMany({
      where: whereClause,
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        storagePath: true,
        sourceUrl: true,
        parseError: true,
        project: {
          select: { id: true, name: true, detailUrl: true },
        },
      },
      orderBy: { fileSize: "desc" },
      take: batchSize,
    });

    // Filter by error type if specified
    let filesToProcess = unparsedFiles;
    if (errorType) {
      filesToProcess = unparsedFiles.filter((f) => {
        if (!f.parseError) return errorType === "No Error";
        return categorizeError(f.parseError) === errorType;
      });
    }

    // Update job target count
    await prisma.pipelineJob.update({
      where: { id: pipelineJob.id },
      data: { targetCount: filesToProcess.length },
    });

    const results: ParseResult["details"] = [];
    let successCount = 0;
    let failCount = 0;

    // Process each file
    for (const file of filesToProcess) {
      try {
        let buffer: Buffer | null = null;

        // Try storage first
        if (file.storagePath) {
          try {
            const { data, error } = await supabase.storage
              .from("project-files")
              .download(file.storagePath);

            if (!error && data) {
              buffer = Buffer.from(await data.arrayBuffer());
            }
          } catch {
            // Storage download failed, try URL
          }
        }

        // Try source URL
        if (!buffer && file.sourceUrl) {
          try {
            const response = await fetch(file.sourceUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Accept: "application/octet-stream, */*",
                Referer: file.project.detailUrl || file.sourceUrl,
              },
            });

            if (response.ok) {
              buffer = Buffer.from(await response.arrayBuffer());
            }
          } catch {
            // URL download failed
          }
        }

        if (!buffer) {
          results.push({
            id: file.id,
            fileName: file.fileName,
            status: "skipped",
            message: "Download failed",
          });
          continue;
        }

        // Detect file type
        const detectedType = detectFileType(buffer);
        if (detectedType === "unknown") {
          results.push({
            id: file.id,
            fileName: file.fileName,
            status: "skipped",
            message: "Unknown file type",
          });
          continue;
        }

        // Parse document
        const parseResult = await parseDocument(buffer, detectedType, "text");

        if (parseResult.success && parseResult.text && parseResult.text.length > 50) {
          // Update database with parsed content
          await prisma.projectAttachment.update({
            where: { id: file.id },
            data: {
              isParsed: true,
              parsedContent: parseResult.text.substring(0, 10000),
              parseError: null,
              updatedAt: new Date(),
            },
          });

          successCount++;
          results.push({
            id: file.id,
            fileName: file.fileName,
            status: "success",
            message: `Parsed ${parseResult.text.length} chars`,
          });
        } else {
          const errorMsg = parseResult.error || "No text extracted";
          await prisma.projectAttachment.update({
            where: { id: file.id },
            data: {
              parseError: errorMsg,
              updatedAt: new Date(),
            },
          });

          failCount++;
          results.push({
            id: file.id,
            fileName: file.fileName,
            status: "failed",
            message: errorMsg,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await prisma.projectAttachment.update({
          where: { id: file.id },
          data: {
            parseError: `Retry error: ${errorMsg}`,
            updatedAt: new Date(),
          },
        });

        failCount++;
        results.push({
          id: file.id,
          fileName: file.fileName,
          status: "failed",
          message: errorMsg,
        });
      }

      // Small delay between files
      await new Promise((r) => setTimeout(r, 200));
    }

    // Update job with results
    await prisma.pipelineJob.update({
      where: { id: pipelineJob.id },
      data: {
        status: "completed",
        successCount,
        failCount,
        result: { details: results },
        completedAt: new Date(),
      },
    });

    const response: ParseResult = {
      jobId: pipelineJob.id,
      processed: results.length,
      success: successCount,
      failed: failCount,
      details: results,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Parse pipeline error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function categorizeError(error: string): string {
  const lower = error.toLowerCase();

  if (lower.includes("download") || lower.includes("다운로드")) return "Download Failed";
  if (lower.includes("timeout") || lower.includes("시간")) return "Timeout";
  if (lower.includes("upload") || lower.includes("업로드")) return "Upload Failed";
  if (lower.includes("no text") || lower.includes("empty")) return "No Text";
  if (lower.includes("certificate")) return "SSL Error";
  if (lower.includes("parse") || lower.includes("파싱")) return "Parse Error";

  return "Other";
}
