import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { grant } from "@/lib/rebac";
import { z } from "zod";

// Validation schema
const createCompanySchema = z.object({
  name: z.string().min(1, "기업명은 필수입니다"),
  businessNumber: z.string().regex(/^\d{10}$/, "사업자등록번호는 10자리 숫자입니다"),
  corporationNumber: z.string().optional(),
  representativeName: z.string().min(1, "대표자명은 필수입니다"),
  establishedDate: z.string().transform((val) => new Date(val)),
  companyType: z.string().min(1, "기업 형태는 필수입니다"),
  phone: z.string().min(1, "전화번호는 필수입니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  address: z.string().min(1, "주소는 필수입니다"),
  addressDetail: z.string().optional(),
  zipcode: z.string().optional(),
  fax: z.string().optional(),
  website: z.string().optional(),
  // 사업 정보 (매칭용)
  businessCategory: z.string().optional(),
  mainBusiness: z.string().optional(),
  businessItems: z.array(z.string()).optional(),
  // 기업 소개
  introduction: z.string().optional(),
  vision: z.string().optional(),
  mission: z.string().optional(),
});

/**
 * GET /api/companies
 * List user's companies
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const companies = await prisma.company.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
        deletedAt: null,
      },
      include: {
        members: {
          where: {
            userId: session.user.id,
          },
          select: {
            role: true,
          },
        },
        _count: {
          select: {
            members: true,
            businessPlans: true,
            matchingResults: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const companiesWithRole = companies.map((company) => ({
      ...company,
      role: company.members[0]?.role || "viewer",
      members: undefined, // Remove members array from response
    }));

    return NextResponse.json(companiesWithRole);
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "기업 목록을 불러오는데 실패했습니다" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies
 * Create new company
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = createCompanySchema.parse(body);

    // Check if business number already exists
    const existingCompany = await prisma.company.findUnique({
      where: { businessNumber: validatedData.businessNumber },
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: "이미 등록된 사업자등록번호입니다" },
        { status: 400 }
      );
    }

    // Create company with transaction
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          ...validatedData,
          members: {
            create: {
              userId: session.user.id,
              role: "owner",
              joinedAt: new Date(),
            },
          },
        },
        include: {
          members: {
            where: {
              userId: session.user.id,
            },
          },
        },
      });

      // Grant owner permission using ReBAC
      await grant("company", newCompany.id, "owner", "user", session.user.id);

      return newCompany;
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "기업 생성에 실패했습니다" },
      { status: 500 }
    );
  }
}
