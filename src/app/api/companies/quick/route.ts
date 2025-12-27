import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { grant } from "@/lib/rebac";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "companies/quick" });

// 업종 매핑
const INDUSTRY_MAP: Record<string, string> = {
  manufacturing: "제조업",
  it_software: "정보통신업",
  bio_medical: "의료/바이오",
  retail_service: "도소매/서비스업",
  food_beverage: "식품/음료",
  construction: "건설업",
  logistics: "운수/물류업",
  contents_media: "콘텐츠/미디어",
  energy_environment: "에너지/환경",
  other: "기타",
};

// 규모 매핑
const SIZE_MAP: Record<string, string> = {
  startup: "예비창업자",
  small: "소기업",
  medium: "중기업",
  midsize: "중견기업",
};

interface QuickCompanyRequest {
  industry: string;
  companySize: string;
  interests?: string[];
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: QuickCompanyRequest = await request.json();
    const { industry, companySize, interests = [] } = body;

    if (!industry || !companySize) {
      return NextResponse.json(
        { error: "업종과 규모는 필수입니다" },
        { status: 400 }
      );
    }

    // Check if user already has a company
    const existingMembership = await prisma.companyMember.findFirst({
      where: { userId: session.user.id },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "이미 등록된 기업이 있습니다", companyId: existingMembership.companyId },
        { status: 400 }
      );
    }

    // Generate temporary business number for quick registration
    const tempBusinessNumber = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create company with minimal info
    const company = await prisma.company.create({
      data: {
        name: `${session.user.name || "사용자"}의 기업`,
        businessNumber: tempBusinessNumber,
        representativeName: session.user.name || "대표자",
        establishedDate: new Date(),
        companyType: "개인사업자",
        businessCategory: INDUSTRY_MAP[industry] || industry,
        mainBusiness: INDUSTRY_MAP[industry] || industry,
        companySize: SIZE_MAP[companySize] || companySize,
        phone: "000-0000-0000",
        email: session.user.email || "",
        address: "주소 미입력",
        // Flag for quick registration
        introduction: `[빠른 등록] 상세 정보 입력 필요`,
      },
    });

    // Create company membership
    await prisma.companyMember.create({
      data: {
        userId: session.user.id,
        companyId: company.id,
        role: "owner",
      },
    });

    // Grant ReBAC permissions
    await grant("company", company.id, "owner", "user", session.user.id);

    // Create matching preferences if interests provided
    if (interests.length > 0) {
      await prisma.matchingPreference.create({
        data: {
          userId: session.user.id,
          companyId: company.id,
          categories: interests,
          regions: ["전국"],
        },
      });
    }

    logger.info("Quick company created", {
      companyId: company.id,
      userId: session.user.id,
      industry,
      companySize,
      interests,
    });

    return NextResponse.json({
      companyId: company.id,
      message: "기업이 등록되었습니다",
    });
  } catch (error) {
    logger.error("Failed to create quick company", { error });
    return NextResponse.json(
      { error: "기업 등록에 실패했습니다" },
      { status: 500 }
    );
  }
}
