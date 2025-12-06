import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { z } from "zod";

const createCertificationSchema = z.object({
  certificationType: z.string().min(1, "인증 유형은 필수입니다"),
  certificationName: z.string().min(1, "인증명은 필수입니다"),
  issuingOrganization: z.string().min(1, "발급 기관은 필수입니다"),
  certificationNumber: z.string().optional(),
  issueDate: z.string().transform((val) => new Date(val)),
  expiryDate: z.string().transform((val) => (val ? new Date(val) : undefined)).optional(),
  fileUrl: z.string().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/companies/[id]/certifications
 * List company certifications (requires member+ permission)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: companyId } = await params;

    const hasPermission = await checkCompanyPermission(session.user.id, companyId, "member");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const certifications = await prisma.companyCertification.findMany({
      where: { companyId },
      orderBy: { issueDate: "desc" },
    });

    return NextResponse.json(certifications);
  } catch (error) {
    console.error("Error fetching certifications:", error);
    return NextResponse.json(
      { error: "인증 정보를 불러오는데 실패했습니다" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[id]/certifications
 * Add certification (requires admin+ permission)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: companyId } = await params;

    const hasPermission = await checkCompanyPermission(session.user.id, companyId, "admin");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = createCertificationSchema.parse(body);

    const certification = await prisma.companyCertification.create({
      data: {
        companyId,
        ...validatedData,
      },
    });

    return NextResponse.json(certification, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creating certification:", error);
    return NextResponse.json(
      { error: "인증 정보 추가에 실패했습니다" },
      { status: 500 }
    );
  }
}
