/**
 * AI Business Plan Generator (PRD 12.6)
 * RAG-based business plan drafting using Gemini 2.5
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { hybridSearch } from "./rag";
import { prisma } from "./prisma";

// Token limits (PRD 12.6)
const CONTEXT_TOKEN_LIMIT = 8000;
const CONTEXT_ALLOCATION = {
  project: 0.4, // 40%
  company: 0.35, // 35%
  references: 0.25, // 25%
} as const;

export interface GenerateBusinessPlanInput {
  companyId: string;
  projectId: string;
  newBusinessDescription: string;
  additionalNotes?: string;
}

export interface BusinessPlanSection {
  sectionIndex: number;
  title: string;
  content: string;
  isAiGenerated: boolean;
}

/**
 * Generate business plan sections using RAG + AI
 */
export async function generateBusinessPlanSections(
  input: GenerateBusinessPlanInput
): Promise<BusinessPlanSection[]> {
  try {
    // Fetch company data
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      include: {
        financials: {
          orderBy: { fiscalYear: "desc" },
          take: 3,
        },
        certifications: {
          where: { isActive: true },
        },
        achievements: {
          orderBy: { achievementDate: "desc" },
          take: 5,
        },
      },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Fetch project data
    const project = await prisma.supportProject.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Build context from RAG (PRD 12.6)
    const ragContext = await buildRagContext({
      projectId: input.projectId,
      companyId: input.companyId,
      newBusinessDescription: input.newBusinessDescription,
    });

    // Generate sections
    const sections: BusinessPlanSection[] = [];

    // Section 1: 사업 개요
    sections.push({
      sectionIndex: 1,
      title: "사업 개요",
      content: await generateSection({
        sectionTitle: "사업 개요",
        company,
        project,
        newBusinessDescription: input.newBusinessDescription,
        ragContext,
        prompt: `다음 정보를 바탕으로 사업 개요를 작성해주세요:

**신규 사업 내용**: ${input.newBusinessDescription}

**지원사업**: ${project.name} (${project.organization})

**기업 정보**:
- 기업명: ${company.name}
- 업종: ${company.businessCategory}
- 주요 사업: ${company.mainBusiness}

사업의 배경, 목적, 필요성을 명확하게 설명하고, 지원사업과의 연관성을 강조해주세요.`,
      }),
      isAiGenerated: true,
    });

    // Section 2: 기업 현황
    sections.push({
      sectionIndex: 2,
      title: "기업 현황",
      content: await generateSection({
        sectionTitle: "기업 현황",
        company,
        project,
        newBusinessDescription: input.newBusinessDescription,
        ragContext,
        prompt: `기업 현황을 다음 정보를 바탕으로 작성해주세요:

**기업 정보**:
- 기업명: ${company.name}
- 설립일: ${company.establishedDate.toLocaleDateString()}
- 기업 형태: ${company.companyType}
- 종업원 수: ${company.employeeCount || "미정"}명
- 자본금: ${company.capitalAmount ? Number(company.capitalAmount).toLocaleString() + "원" : "미정"}

**재무 현황** (최근 3년):
${company.financials
  .map(
    (f) =>
      `- ${f.fiscalYear}년: 매출 ${f.revenue ? Number(f.revenue).toLocaleString() + "원" : "미정"}, 영업이익 ${f.operatingProfit ? Number(f.operatingProfit).toLocaleString() + "원" : "미정"}`
  )
  .join("\n")}

**보유 인증**:
${company.isVenture ? "- 벤처기업 인증\n" : ""}${company.isInnoBiz ? "- 이노비즈 인증\n" : ""}${company.isMainBiz ? "- 메인비즈 인증\n" : ""}

기업의 강점과 경쟁력을 강조하며 작성해주세요.`,
      }),
      isAiGenerated: true,
    });

    // Section 3: 사업 내용
    sections.push({
      sectionIndex: 3,
      title: "사업 내용",
      content: await generateSection({
        sectionTitle: "사업 내용",
        company,
        project,
        newBusinessDescription: input.newBusinessDescription,
        ragContext,
        prompt: `다음 신규 사업에 대한 상세한 내용을 작성해주세요:

**신규 사업**: ${input.newBusinessDescription}

다음 내용을 포함해주세요:
1. 사업의 구체적인 내용과 범위
2. 핵심 기술 또는 서비스
3. 목표 고객 및 시장
4. 기대 효과

지원사업 "${project.name}"의 목적에 부합하도록 작성해주세요.`,
      }),
      isAiGenerated: true,
    });

    // Section 4: 추진 계획
    sections.push({
      sectionIndex: 4,
      title: "추진 계획",
      content: await generateSection({
        sectionTitle: "추진 계획",
        company,
        project,
        newBusinessDescription: input.newBusinessDescription,
        ragContext,
        prompt: `사업 추진 계획을 작성해주세요:

**사업 기간**: ${project.startDate && project.endDate ? `${project.startDate.toLocaleDateString()} ~ ${project.endDate.toLocaleDateString()}` : "프로젝트 일정에 따름"}

다음 내용을 포함해주세요:
1. 단계별 추진 일정 (월별 또는 분기별)
2. 주요 마일스톤
3. 투입 인력 계획
4. 예산 집행 계획

구체적이고 실현 가능한 계획을 작성해주세요.`,
      }),
      isAiGenerated: true,
    });

    // Section 5: 기대 효과
    sections.push({
      sectionIndex: 5,
      title: "기대 효과",
      content: await generateSection({
        sectionTitle: "기대 효과",
        company,
        project,
        newBusinessDescription: input.newBusinessDescription,
        ragContext,
        prompt: `사업의 기대 효과를 작성해주세요:

다음 관점에서 작성해주세요:
1. **경제적 효과**: 매출 증대, 비용 절감, 고용 창출 등
2. **기술적 효과**: 기술 개발, 특허 출원, 노하우 축적 등
3. **사회적 효과**: 산업 발전, 지역 경제 기여, 환경 개선 등

구체적인 수치와 근거를 포함하여 작성해주세요.`,
      }),
      isAiGenerated: true,
    });

    return sections;
  } catch (error) {
    console.error("[BusinessPlan] Generate sections error:", error);
    throw new Error("Failed to generate business plan sections");
  }
}

/**
 * Build RAG context (PRD 12.6)
 */
async function buildRagContext(input: {
  projectId: string;
  companyId: string;
  newBusinessDescription: string;
}): Promise<string> {
  try {
    // Search project context (40% allocation)
    const projectResults = await hybridSearch({
      queryText: input.newBusinessDescription,
      sourceType: "support_project",
      matchThreshold: 0.6,
      matchCount: 5,
      semanticWeight: 0.7,
    });

    const projectContext = projectResults
      .filter((r) => r.sourceId === input.projectId)
      .slice(0, 3)
      .map((r) => r.content)
      .join("\n\n");

    // Search company context (35% allocation)
    const companyResults = await hybridSearch({
      queryText: input.newBusinessDescription,
      sourceType: "company",
      matchThreshold: 0.5,
      matchCount: 3,
    });

    const companyContext = companyResults
      .filter((r) => r.sourceId === input.companyId)
      .slice(0, 2)
      .map((r) => r.content)
      .join("\n\n");

    // Combine context
    return `
## 지원사업 관련 정보
${projectContext || "정보 없음"}

## 기업 관련 정보
${companyContext || "정보 없음"}
`.trim();
  } catch (error) {
    console.error("[BusinessPlan] Build RAG context error:", error);
    return "";
  }
}

/**
 * Generate single section using Gemini
 */
async function generateSection(params: {
  sectionTitle: string;
  company: any;
  project: any;
  newBusinessDescription: string;
  ragContext: string;
  prompt: string;
}): Promise<string> {
  try {
    const systemPrompt = `당신은 정부 지원사업 사업계획서 작성 전문가입니다.
다음 원칙을 준수하여 사업계획서를 작성해주세요:

1. 명확하고 구체적으로 작성
2. 지원사업의 목적과 평가 기준에 부합
3. 기업의 강점과 역량 강조
4. 실현 가능하고 구체적인 계획 제시
5. 전문적이고 설득력 있는 문체 사용

RAG 컨텍스트:
${params.ragContext}`;

    const { text } = await generateText({
      model: google("gemini-3-pro-preview"),
      system: systemPrompt,
      prompt: params.prompt,
      // Temperature: Keep default 1.0 (recommended for Gemini 3)
      maxOutputTokens: 2000,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 8192, // High reasoning budget for complex business plan generation
            includeThoughts: false, // Internal reasoning only
          },
        },
      },
    });

    return text.trim();
  } catch (error) {
    console.error(
      `[BusinessPlan] Generate section "${params.sectionTitle}" error:`,
      error
    );
    return `[AI 생성 실패] ${params.sectionTitle} 섹션을 생성할 수 없습니다. 수동으로 작성해주세요.`;
  }
}

/**
 * Generate single section (for editing existing plan)
 */
export async function regenerateSection(
  businessPlanId: string,
  sectionIndex: number
): Promise<string> {
  try {
    // Get business plan
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id: businessPlanId },
      include: {
        company: {
          include: {
            financials: { orderBy: { fiscalYear: "desc" }, take: 3 },
            certifications: { where: { isActive: true } },
            achievements: { orderBy: { achievementDate: "desc" }, take: 5 },
          },
        },
        project: true,
        sections: {
          where: { sectionIndex },
        },
      },
    });

    if (!businessPlan || !businessPlan.sections[0]) {
      throw new Error("Business plan or section not found");
    }

    const section = businessPlan.sections[0];

    // Build RAG context
    const ragContext = await buildRagContext({
      projectId: businessPlan.projectId || "",
      companyId: businessPlan.companyId,
      newBusinessDescription: businessPlan.newBusinessDescription || "",
    });

    // Determine prompt based on section title
    const prompts: Record<string, string> = {
      사업개요: `사업 개요를 재작성해주세요. 배경, 목적, 필요성을 명확하게 설명하고, 지원사업과의 연관성을 강조해주세요.`,
      기업현황: `기업 현황을 재작성해주세요. 기업의 강점과 경쟁력을 강조하며 작성해주세요.`,
      사업내용: `사업 내용을 재작성해주세요. 구체적인 내용, 핵심 기술, 목표 시장, 기대 효과를 포함해주세요.`,
      추진계획: `추진 계획을 재작성해주세요. 단계별 일정, 마일스톤, 인력 계획, 예산 계획을 구체적으로 작성해주세요.`,
      기대효과: `기대 효과를 재작성해주세요. 경제적, 기술적, 사회적 효과를 구체적인 수치와 함께 작성해주세요.`,
    };

    const prompt =
      prompts[section.title.replace(/\s/g, "")] ||
      `"${section.title}" 섹션을 재작성해주세요.`;

    const content = await generateSection({
      sectionTitle: section.title,
      company: businessPlan.company,
      project: businessPlan.project,
      newBusinessDescription: businessPlan.newBusinessDescription || "",
      ragContext,
      prompt,
    });

    return content;
  } catch (error) {
    console.error("[BusinessPlan] Regenerate section error:", error);
    throw new Error("Failed to regenerate section");
  }
}
