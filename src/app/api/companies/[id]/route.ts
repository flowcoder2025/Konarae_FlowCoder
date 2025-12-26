import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "company-detail" });

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  representativeName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  address: z.string().min(1).optional(),
  addressDetail: z.string().optional(),
  zipcode: z.string().optional(),
  fax: z.string().optional(),
  website: z.string().optional(),
  businessCategory: z.string().optional(),
  mainBusiness: z.string().optional(),
  businessItems: z.array(z.string()).optional(),
  employeeCount: z.number().optional(),
  capitalAmount: z.bigint().optional(),
  annualRevenue: z.bigint().optional(),
  companySize: z.string().optional(),
  isVenture: z.boolean().optional(),
  isInnoBiz: z.boolean().optional(),
  isMainBiz: z.boolean().optional(),
  isSocial: z.boolean().optional(),
  isWomen: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
  introduction: z.string().optional(),
  vision: z.string().optional(),
  mission: z.string().optional(),
  coreValues: z.array(z.string()).optional(),
  logoUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /api/companies/[id]
 * Get company details (requires member+ permission)
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

    const { id } = await params;

    // Check permission
    const hasPermission = await checkCompanyPermission(session.user.id, id, "viewer");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id, deletedAt: null },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        financials: {
          orderBy: {
            fiscalYear: "desc",
          },
        },
        certifications: {
          where: {
            isActive: true,
          },
          orderBy: {
            issueDate: "desc",
          },
        },
        achievements: {
          orderBy: {
            achievementDate: "desc",
          },
        },
        _count: {
          select: {
            businessPlans: true,
            matchingResults: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "기업을 찾을 수 없습니다" }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    logger.error("Failed to fetch company", { error });
    return NextResponse.json(
      { error: "기업 정보를 불러오는데 실패했습니다" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/companies/[id]
 * Update company (requires admin+ permission)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission
    const hasPermission = await checkCompanyPermission(session.user.id, id, "admin");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = updateCompanySchema.parse(body);

    const company = await prisma.company.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to update company", { error });
    return NextResponse.json(
      { error: "기업 정보 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/companies/[id]
 * Delete company (soft delete, requires owner permission)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission - only owner can delete
    const hasPermission = await checkCompanyPermission(session.user.id, id, "owner");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    // Soft delete
    await prisma.company.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "기업이 삭제되었습니다" });
  } catch (error) {
    logger.error("Failed to delete company", { error });
    return NextResponse.json(
      { error: "기업 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
