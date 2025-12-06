import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { z } from "zod";

const createFinancialSchema = z.object({
  fiscalYear: z.number().min(1900).max(2100),
  revenue: z.bigint().optional(),
  operatingProfit: z.bigint().optional(),
  netProfit: z.bigint().optional(),
  totalAssets: z.bigint().optional(),
  totalLiabilities: z.bigint().optional(),
  equity: z.bigint().optional(),
  creditRating: z.string().optional(),
  ratingAgency: z.string().optional(),
  ratingDate: z.string().transform((val) => (val ? new Date(val) : undefined)).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/companies/[id]/financials
 * List company financials (requires member+ permission)
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

    const financials = await prisma.companyFinancial.findMany({
      where: { companyId },
      orderBy: { fiscalYear: "desc" },
    });

    return NextResponse.json(financials);
  } catch (error) {
    console.error("Error fetching financials:", error);
    return NextResponse.json(
      { error: "재무 정보를 불러오는데 실패했습니다" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[id]/financials
 * Add financial record (requires admin+ permission)
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
    const validatedData = createFinancialSchema.parse(body);

    const financial = await prisma.companyFinancial.create({
      data: {
        companyId,
        ...validatedData,
      },
    });

    return NextResponse.json(financial, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creating financial:", error);
    return NextResponse.json(
      { error: "재무 정보 추가에 실패했습니다" },
      { status: 500 }
    );
  }
}
