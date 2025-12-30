/**
 * Business Plan Sections API
 * GET /api/business-plans/:id/sections - List sections
 * POST /api/business-plans/:id/sections - Add new section (manual)
 * PUT /api/business-plans/:id/sections/reorder - Reorder sections
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import type { Company, BusinessPlan, SupportProject } from "@prisma/client";

const logger = createLogger({ api: "business-plan-sections" });

// 기본 템플릿 섹션 정의 (Route 파일에서는 export 불가)
const DEFAULT_SECTIONS = [
  { title: "기업 개요", description: "기업 소개, 연혁, 조직도" },
  { title: "사업 개요", description: "사업 목적, 필요성, 추진 배경" },
  { title: "수행 계획", description: "추진 일정, 세부 내용, 방법론" },
  { title: "수행 역량", description: "참여 인력, 전문성, 수행 실적" },
  { title: "사업 예산", description: "비용 산정, 자부담 계획" },
];

// 타입 정의
interface ExecutionPhase {
  name: string;
  duration: string;
  tasks: string[];
}

interface ExecutionPlan {
  duration?: string;
  phases?: ExecutionPhase[];
}

interface BudgetBreakdownItem {
  category: string;
  amount: number;
  description: string;
}

interface BudgetPlan {
  governmentFunding?: number;
  selfFunding?: number;
  totalAmount?: number;
  breakdown?: BudgetBreakdownItem[];
}

interface ExpectedOutcomes {
  employment?: number;
  sales?: number;
  exportAmount?: number;
  patentCount?: number;
  certificationCount?: number;
}

// 금액 포맷팅 헬퍼
function formatAmount(amount: number | bigint | null | undefined): string {
  if (!amount) return "0원";
  const num = typeof amount === "bigint" ? Number(amount) : amount;
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(1).replace(/\.0$/, "")}억원`;
  } else if (num >= 10000) {
    return `${Math.floor(num / 10000).toLocaleString()}만원`;
  }
  return `${num.toLocaleString()}원`;
}

// 인증 현황 배열 생성
function getCertifications(company: Company): string[] {
  const certs: string[] = [];
  if (company.isVenture) certs.push("벤처기업");
  if (company.isInnoBiz) certs.push("이노비즈");
  if (company.isMainBiz) certs.push("메인비즈");
  if (company.isSocial) certs.push("사회적기업");
  if (company.isWomen) certs.push("여성기업");
  if (company.isDisabled) certs.push("장애인기업");
  return certs;
}

// 기업 개요 섹션 콘텐츠 생성
function generateCompanyOverviewContent(company: Company): string {
  const certifications = getCertifications(company);
  const established = company.establishedDate
    ? new Date(company.establishedDate).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "미입력";

  let content = `## 기업 개요\n\n`;
  content += `### 기업 기본 정보\n\n`;
  content += `| 항목 | 내용 |\n`;
  content += `|------|------|\n`;
  content += `| 기업명 | ${company.name} |\n`;
  content += `| 사업자등록번호 | ${company.businessNumber} |\n`;
  content += `| 대표자 | ${company.representativeName} |\n`;
  content += `| 설립일 | ${established} |\n`;
  content += `| 기업형태 | ${company.companyType || "미입력"} |\n`;

  if (company.employeeCount) {
    content += `| 상시근로자 수 | ${company.employeeCount}명 |\n`;
  }
  if (company.capitalAmount) {
    content += `| 자본금 | ${formatAmount(company.capitalAmount)} |\n`;
  }
  if (company.annualRevenue) {
    content += `| 연매출 | ${formatAmount(company.annualRevenue)} |\n`;
  }

  if (company.businessCategory || company.mainBusiness) {
    content += `\n### 사업 분야\n\n`;
    if (company.businessCategory) {
      content += `- **업종**: ${company.businessCategory}\n`;
    }
    if (company.mainBusiness) {
      content += `- **주요 사업**: ${company.mainBusiness}\n`;
    }
  }

  if (certifications.length > 0) {
    content += `\n### 인증 현황\n\n`;
    content += certifications.map((c) => `- ${c}`).join("\n") + "\n";
  }

  if (company.introduction) {
    content += `\n### 기업 소개\n\n${company.introduction}\n`;
  }

  if (company.vision) {
    content += `\n### 비전\n\n${company.vision}\n`;
  }

  return content;
}

// 사업 개요 섹션 콘텐츠 생성
function generateBusinessOverviewContent(
  businessPlan: BusinessPlan,
  project: SupportProject | null
): string {
  let content = `## 사업 개요\n\n`;

  content += `### 사업 목적\n\n`;
  if (businessPlan.newBusinessDescription) {
    content += `${businessPlan.newBusinessDescription}\n`;
  } else {
    content += `*사업의 목적과 필요성을 작성해주세요.*\n`;
  }

  if (project) {
    content += `\n### 지원사업 정보\n\n`;
    content += `- **지원사업명**: ${project.name}\n`;
    content += `- **주관기관**: ${project.organization}\n`;
    if (project.category) {
      content += `- **사업 분야**: ${project.category}\n`;
    }
  }

  if (businessPlan.additionalNotes) {
    content += `\n### 추가 참고사항\n\n${businessPlan.additionalNotes}\n`;
  }

  return content;
}

// 수행 계획 섹션 콘텐츠 생성
function generateExecutionPlanContent(executionPlan: ExecutionPlan | null): string {
  let content = `## 수행 계획\n\n`;

  if (executionPlan?.duration) {
    content += `### 총 사업 기간\n\n`;
    content += `**${executionPlan.duration}**\n\n`;
  }

  if (executionPlan?.phases && executionPlan.phases.length > 0) {
    content += `### 단계별 추진 일정\n\n`;
    executionPlan.phases.forEach((phase, idx) => {
      content += `#### ${idx + 1}단계: ${phase.name || `Phase ${idx + 1}`}`;
      if (phase.duration) {
        content += ` (${phase.duration})`;
      }
      content += `\n\n`;
      if (phase.tasks && phase.tasks.length > 0) {
        content += phase.tasks.map((task) => `- ${task}`).join("\n") + "\n\n";
      }
    });
  } else {
    content += `### 추진 일정\n\n`;
    content += `*단계별 추진 일정을 작성해주세요.*\n\n`;
  }

  return content;
}

// 수행 역량 섹션 콘텐츠 생성
function generateCapabilityContent(company: Company): string {
  const certifications = getCertifications(company);

  let content = `## 수행 역량\n\n`;

  content += `### 조직 현황\n\n`;
  if (company.employeeCount) {
    content += `- **상시근로자 수**: ${company.employeeCount}명\n`;
  }

  if (certifications.length > 0) {
    content += `\n### 기업 인증\n\n`;
    content += certifications.map((c) => `- ${c}`).join("\n") + "\n";
  }

  content += `\n### 참여 인력\n\n`;
  content += `*핵심 참여 인력과 역할을 작성해주세요.*\n\n`;

  content += `### 수행 실적\n\n`;
  content += `*관련 사업 수행 실적을 작성해주세요.*\n`;

  return content;
}

// 사업 예산 섹션 콘텐츠 생성
function generateBudgetContent(budgetPlan: BudgetPlan | null): string {
  let content = `## 사업 예산\n\n`;

  if (
    budgetPlan &&
    (budgetPlan.totalAmount || budgetPlan.governmentFunding || budgetPlan.selfFunding)
  ) {
    content += `### 재원 조달 계획\n\n`;
    content += `| 구분 | 금액 |\n`;
    content += `|------|------|\n`;
    if (budgetPlan.governmentFunding) {
      content += `| 정부지원금 | ${formatAmount(budgetPlan.governmentFunding)} |\n`;
    }
    if (budgetPlan.selfFunding) {
      content += `| 자부담 | ${formatAmount(budgetPlan.selfFunding)} |\n`;
    }
    if (budgetPlan.totalAmount) {
      content += `| **총 사업비** | **${formatAmount(budgetPlan.totalAmount)}** |\n`;
    }

    if (budgetPlan.breakdown && budgetPlan.breakdown.length > 0) {
      content += `\n### 비목별 예산\n\n`;
      content += `| 비목 | 금액 | 설명 |\n`;
      content += `|------|------|------|\n`;
      budgetPlan.breakdown.forEach((item) => {
        content += `| ${item.category} | ${formatAmount(item.amount)} | ${item.description || ""} |\n`;
      });
    }
  } else {
    content += `### 재원 조달 계획\n\n`;
    content += `*총 사업비와 재원 조달 계획을 작성해주세요.*\n\n`;
    content += `### 비목별 예산\n\n`;
    content += `*세부 예산 항목을 작성해주세요.*\n`;
  }

  return content;
}

// 기대 효과 섹션 콘텐츠 생성
function generateExpectedOutcomesContent(outcomes: ExpectedOutcomes | null): string {
  let content = `## 기대 효과\n\n`;

  if (outcomes && Object.values(outcomes).some((v) => v && v > 0)) {
    content += `### 정량적 목표\n\n`;
    content += `| 성과 지표 | 목표 |\n`;
    content += `|----------|------|\n`;

    if (outcomes.employment && outcomes.employment > 0) {
      content += `| 신규 고용 | ${outcomes.employment}명 |\n`;
    }
    if (outcomes.sales && outcomes.sales > 0) {
      content += `| 매출 증가 | ${formatAmount(outcomes.sales)} |\n`;
    }
    if (outcomes.exportAmount && outcomes.exportAmount > 0) {
      content += `| 수출액 | ${formatAmount(outcomes.exportAmount)} |\n`;
    }
    if (outcomes.patentCount && outcomes.patentCount > 0) {
      content += `| 특허 출원/등록 | ${outcomes.patentCount}건 |\n`;
    }
    if (outcomes.certificationCount && outcomes.certificationCount > 0) {
      content += `| 인증 취득 | ${outcomes.certificationCount}건 |\n`;
    }

    content += `\n### 정성적 기대효과\n\n`;
    content += `*사업 완료 후 예상되는 정성적 효과를 작성해주세요.*\n`;
  } else {
    content += `### 정량적 목표\n\n`;
    content += `*사업 완료 후 달성할 정량적 목표를 작성해주세요.*\n\n`;
    content += `### 정성적 기대효과\n\n`;
    content += `*사업 완료 후 예상되는 정성적 효과를 작성해주세요.*\n`;
  }

  return content;
}

const addSectionSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  content: z.string().optional().default(""),
  sectionIndex: z.number().optional(), // 지정하지 않으면 마지막에 추가
});

const initializeTemplateSchema = z.object({
  mode: z.literal("template"),
});

// GET - List sections
export async function GET(
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

    const sections = await prisma.businessPlanSection.findMany({
      where: { businessPlanId: id },
      orderBy: { sectionIndex: "asc" },
    });

    return NextResponse.json({ sections });
  } catch (error) {
    logger.error("Failed to fetch sections", { error });
    return NextResponse.json(
      { error: "Failed to fetch sections" },
      { status: 500 }
    );
  }
}

// POST - Add new section or initialize template
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

    // Check permission (editor+)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "editor"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // 템플릿 초기화 모드 체크
    if (body.mode === "template") {
      // 기존 섹션이 있는지 확인
      const existingCount = await prisma.businessPlanSection.count({
        where: { businessPlanId: id },
      });

      if (existingCount > 0) {
        return NextResponse.json(
          { error: "이미 섹션이 존재합니다. 기존 섹션을 삭제한 후 템플릿을 초기화해주세요." },
          { status: 400 }
        );
      }

      // BusinessPlan과 관련 데이터 조회 (사용자 입력 데이터 + 기업 프로필)
      const businessPlan = await prisma.businessPlan.findUnique({
        where: { id },
        include: {
          company: true,
          project: true,
        },
      });

      if (!businessPlan) {
        return NextResponse.json(
          { error: "사업계획서를 찾을 수 없습니다" },
          { status: 404 }
        );
      }

      // 사용자가 입력한 구조화된 데이터 파싱
      const executionPlan = businessPlan.executionPlan as ExecutionPlan | null;
      const budgetPlan = businessPlan.budgetPlan as BudgetPlan | null;
      const expectedOutcomes = businessPlan.expectedOutcomes as ExpectedOutcomes | null;

      // 기업 프로필과 사용자 입력을 반영한 섹션 콘텐츠 생성
      const sectionsData: { title: string; content: string }[] = [];

      // 1. 기업 개요 - 기업 마스터 프로필 적용
      if (businessPlan.company) {
        sectionsData.push({
          title: "기업 개요",
          content: generateCompanyOverviewContent(businessPlan.company),
        });
      } else {
        sectionsData.push({
          title: "기업 개요",
          content: `## 기업 개요\n\n기업 소개, 연혁, 조직도에 대한 내용을 작성해주세요.`,
        });
      }

      // 2. 사업 개요 - 사용자 입력 (newBusinessDescription, additionalNotes) 적용
      sectionsData.push({
        title: "사업 개요",
        content: generateBusinessOverviewContent(businessPlan, businessPlan.project),
      });

      // 3. 수행 계획 - 사용자 입력 (executionPlan) 적용
      sectionsData.push({
        title: "수행 계획",
        content: generateExecutionPlanContent(executionPlan),
      });

      // 4. 수행 역량 - 기업 프로필 적용
      if (businessPlan.company) {
        sectionsData.push({
          title: "수행 역량",
          content: generateCapabilityContent(businessPlan.company),
        });
      } else {
        sectionsData.push({
          title: "수행 역량",
          content: `## 수행 역량\n\n참여 인력, 전문성, 수행 실적에 대한 내용을 작성해주세요.`,
        });
      }

      // 5. 사업 예산 - 사용자 입력 (budgetPlan) 적용
      sectionsData.push({
        title: "사업 예산",
        content: generateBudgetContent(budgetPlan),
      });

      // 6. 기대 효과 - 사용자 입력 (expectedOutcomes) 적용 (데이터가 있을 때만 추가)
      if (expectedOutcomes && Object.values(expectedOutcomes).some((v) => v && v > 0)) {
        sectionsData.push({
          title: "기대 효과",
          content: generateExpectedOutcomesContent(expectedOutcomes),
        });
      }

      // 섹션 생성
      const sections = await prisma.businessPlanSection.createMany({
        data: sectionsData.map((section, index) => ({
          businessPlanId: id,
          sectionIndex: index,
          title: section.title,
          content: section.content,
          isAiGenerated: false,
        })),
      });

      // 상태 업데이트
      await prisma.businessPlan.update({
        where: { id },
        data: { status: "in_progress" },
      });

      logger.info("Template initialized with user data and company profile", {
        businessPlanId: id,
        sectionsCount: sections.count,
        hasCompany: !!businessPlan.company,
        hasProject: !!businessPlan.project,
        hasExecutionPlan: !!executionPlan,
        hasBudgetPlan: !!budgetPlan,
        hasExpectedOutcomes: !!expectedOutcomes,
      });

      return NextResponse.json({
        success: true,
        message: "템플릿이 초기화되었습니다. 입력하신 정보와 기업 프로필이 자동으로 적용되었습니다.",
        sectionsCount: sections.count,
        appliedData: {
          companyProfile: !!businessPlan.company,
          projectInfo: !!businessPlan.project,
          executionPlan: !!executionPlan?.duration || (executionPlan?.phases?.length ?? 0) > 0,
          budgetPlan: !!(budgetPlan?.governmentFunding || budgetPlan?.selfFunding),
          expectedOutcomes: !!expectedOutcomes && Object.values(expectedOutcomes).some((v) => v && v > 0),
        },
      });
    }

    // 단일 섹션 추가 모드
    const validatedData = addSectionSchema.parse(body);

    // 현재 최대 sectionIndex 조회
    const maxIndexResult = await prisma.businessPlanSection.aggregate({
      where: { businessPlanId: id },
      _max: { sectionIndex: true },
    });

    const nextIndex = (maxIndexResult._max.sectionIndex ?? -1) + 1;
    const targetIndex = validatedData.sectionIndex ?? nextIndex;

    // 지정된 인덱스에 삽입하는 경우, 기존 섹션들의 인덱스 조정
    if (validatedData.sectionIndex !== undefined) {
      await prisma.businessPlanSection.updateMany({
        where: {
          businessPlanId: id,
          sectionIndex: { gte: targetIndex },
        },
        data: {
          sectionIndex: { increment: 1 },
        },
      });
    }

    const section = await prisma.businessPlanSection.create({
      data: {
        businessPlanId: id,
        sectionIndex: targetIndex,
        title: validatedData.title,
        content: validatedData.content || "",
        isAiGenerated: false,
      },
    });

    return NextResponse.json({
      success: true,
      section,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to add section", { error });
    return NextResponse.json(
      { error: "Failed to add section" },
      { status: 500 }
    );
  }
}
