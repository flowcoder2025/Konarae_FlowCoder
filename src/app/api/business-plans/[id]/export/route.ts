/**
 * Business Plan Export API (PRD 4.5)
 * POST /api/business-plans/:id/export - Export to file
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
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

    // Build document content
    const documentContent = buildDocumentContent(businessPlan);

    // TODO: Integrate with Railway document generation service
    // For now, return the content as JSON
    // In production, this should call Railway microservice to generate the file

    return NextResponse.json({
      success: true,
      format: validatedData.format,
      content: documentContent,
      message: "Export prepared (file generation pending Railway integration)",
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
 * Build document content from business plan
 */
function buildDocumentContent(businessPlan: any): string {
  const { title, company, project, sections } = businessPlan;

  let content = `# ${title}\n\n`;
  content += `**기업명**: ${company.name}\n`;
  content += `**지원사업**: ${project?.name || "미정"}\n`;
  content += `**작성일**: ${new Date().toLocaleDateString("ko-KR")}\n\n`;
  content += `---\n\n`;

  for (const section of sections) {
    content += `## ${section.title}\n\n`;
    content += `${section.content}\n\n`;
  }

  return content;
}
