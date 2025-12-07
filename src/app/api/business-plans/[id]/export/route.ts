/**
 * Business Plan Export API (PRD 4.5)
 * POST /api/business-plans/:id/export - Export to file
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { exportBusinessPlan, type BusinessPlanExportData, type ExportFormat } from "@/lib/export";
import { z } from "zod";

const exportSchema = z.object({
  format: z.enum(["pdf", "docx", "hwp"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (viewer+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "viewer"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = exportSchema.parse(body);

    // Get business plan with sections
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id },
      include: {
        company: true,
        project: true,
        sections: {
          orderBy: { sectionIndex: "asc" },
        },
      },
    });

    if (!businessPlan) {
      return NextResponse.json(
        { error: "Business plan not found" },
        { status: 404 }
      );
    }

    // 실제 파일 생성
    const exportData: BusinessPlanExportData = {
      title: businessPlan.title,
      companyName: businessPlan.company?.name,
      projectName: businessPlan.project?.name,
      createdAt: businessPlan.createdAt,
      sections: businessPlan.sections.map((section: any) => ({
        title: section.title,
        content: section.content || "",
        order: section.sectionIndex,
      })),
      metadata: {
        author: session.user.name || session.user.email || "Unknown",
      },
    };

    const result = await exportBusinessPlan(
      exportData,
      validatedData.format as ExportFormat
    );

    if (!result.success || !result.blob) {
      return NextResponse.json(
        { error: result.error || "Export failed" },
        { status: 500 }
      );
    }

    // Blob을 ArrayBuffer로 변환
    const arrayBuffer = await result.blob.arrayBuffer();

    // 파일 다운로드 응답
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": getMimeType(validatedData.format),
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[API] Export business plan error:", error);
    return NextResponse.json(
      { error: "Failed to export business plan" },
      { status: 500 }
    );
  }
}

/**
 * Get MIME type for export format
 */
function getMimeType(format: string): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "hwp":
      return "application/x-hwp"; // HWP MIME type
    default:
      return "application/octet-stream";
  }
}
