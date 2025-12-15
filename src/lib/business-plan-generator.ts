/**
 * AI Business Plan Generator (PRD 12.6)
 * RAG-based business plan drafting using Gemini 2.5
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { hybridSearch, storeDocumentEmbeddings, deleteEmbeddings } from "./rag";
import { prisma } from "./prisma";
import { formatDateKST } from "./utils";

// Token limits (PRD 12.6) - Reserved for future optimization
const _CONTEXT_TOKEN_LIMIT = 8000;
const _CONTEXT_ALLOCATION = {
  project: 0.4, // 40%
  company: 0.35, // 35%
  references: 0.25, // 25%
} as const;

// 기본 섹션 템플릿 (양식 추출 실패 시 폴백)
const DEFAULT_SECTIONS = [
  { title: "사업 개요", promptHint: "사업의 배경, 목적, 필요성을 명확하게 설명하고, 지원사업과의 연관성을 강조" },
  { title: "기업 현황", promptHint: "기업의 강점과 경쟁력을 강조하며 작성" },
  { title: "사업 내용", promptHint: "구체적인 내용, 핵심 기술, 목표 시장, 기대 효과를 포함" },
  { title: "추진 계획", promptHint: "단계별 일정, 마일스톤, 인력 계획, 예산 계획을 구체적으로 작성" },
  { title: "기대 효과", promptHint: "경제적, 기술적, 사회적 효과를 구체적인 수치와 함께 작성" },
] as const;

interface FormSection {
  title: string;
  promptHint: string;
}

/**
 * Extract form structure from project attachments using AI
 * Searches for 신청서, 양식, 사업계획서 files and extracts section structure
 */
async function extractFormStructure(projectId: string): Promise<FormSection[]> {
  try {
    // Find form-related attachments from project
    const attachments = await prisma.projectAttachment.findMany({
      where: {
        projectId,
        isParsed: true,
        parsedContent: { not: null },
      },
    });

    // Filter for form files (신청서, 양식, 사업계획서, 공고문)
    const formKeywords = ["신청서", "양식", "사업계획서", "작성서식", "서식", "공고문", "공고"];
    const formAttachments = attachments.filter((a) =>
      formKeywords.some((keyword) => a.fileName.includes(keyword))
    );

    if (formAttachments.length === 0) {
      console.log("[BusinessPlan] No form attachments found, using default sections");
      return [...DEFAULT_SECTIONS];
    }

    // Use the first form attachment's parsed content
    const formContent = formAttachments[0].parsedContent;
    if (!formContent) {
      return [...DEFAULT_SECTIONS];
    }

    // Use Gemini to extract section structure from the form
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system: `당신은 정부 지원사업 신청서/사업계획서 양식을 분석하는 전문가입니다.
주어진 양식 내용에서 작성해야 하는 섹션(항목)들을 추출해주세요.

응답 형식 (JSON만, 다른 텍스트 없이):
[{"title":"섹션제목","promptHint":"작성힌트"}]

주의사항:
- 작성이 필요한 섹션만 추출 (단순 안내문, 표지, 서약서 등 제외)
- promptHint는 50자 이내로 간결하게
- JSON만 출력, 설명 없이`,
      prompt: `다음 양식에서 작성 섹션을 추출하세요:

${formContent.slice(0, 6000)}`,
      maxOutputTokens: 1000,
    });

    // Parse the AI response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text.trim();

      // Remove markdown code blocks
      if (jsonStr.includes("```")) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          jsonStr = match[1].trim();
        } else {
          jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\s*$/g, "").trim();
        }
      }

      // Try to find JSON array in response
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      console.log(`[BusinessPlan] AI response for form extraction: ${jsonStr.slice(0, 200)}...`);

      const sections = JSON.parse(jsonStr) as FormSection[];

      if (Array.isArray(sections) && sections.length > 0) {
        console.log(`[BusinessPlan] Extracted ${sections.length} sections from form`);
        return sections;
      }
    } catch (parseError) {
      console.error("[BusinessPlan] Failed to parse AI response:", parseError);
      console.error("[BusinessPlan] Raw response:", text.slice(0, 500));
    }

    return [...DEFAULT_SECTIONS];
  } catch (error) {
    console.error("[BusinessPlan] Extract form structure error:", error);
    return [...DEFAULT_SECTIONS];
  }
}

export interface GenerateBusinessPlanInput {
  companyId: string;
  projectId: string;
  newBusinessDescription: string;
  additionalNotes?: string;
  referenceBusinessPlanIds?: string[];
  businessPlanId?: string; // For fetching attachments
}

export interface BusinessPlanSection {
  sectionIndex: number;
  title: string;
  content: string;
  isAiGenerated: boolean;
}

/**
 * Generate business plan sections using RAG + AI
 * Dynamically extracts section structure from form attachments
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

    // Extract form structure from attachments (dynamic section detection)
    const formSections = await extractFormStructure(input.projectId);
    console.log(`[BusinessPlan] Using ${formSections.length} sections: ${formSections.map(s => s.title).join(", ")}`);

    // Build context from RAG with evaluation criteria, reference plans, and attachments (PRD 12.6)
    const { context: ragContext, evaluationCriteria } = await buildRagContext({
      projectId: input.projectId,
      companyId: input.companyId,
      newBusinessDescription: input.newBusinessDescription,
      referenceBusinessPlanIds: input.referenceBusinessPlanIds,
      businessPlanId: input.businessPlanId,
    });

    // Build company context for prompts
    const companyContext = buildCompanyContext(company);

    // Generate sections dynamically
    const sections: BusinessPlanSection[] = [];

    for (let i = 0; i < formSections.length; i++) {
      const formSection = formSections[i];

      sections.push({
        sectionIndex: i + 1,
        title: formSection.title,
        content: await generateSection({
          sectionTitle: formSection.title,
          company,
          project,
          newBusinessDescription: input.newBusinessDescription,
          ragContext,
          evaluationCriteria,
          prompt: buildDynamicPrompt({
            sectionTitle: formSection.title,
            promptHint: formSection.promptHint,
            companyContext,
            projectName: project.name,
            projectOrganization: project.organization,
            newBusinessDescription: input.newBusinessDescription,
            projectDateRange: project.startDate && project.endDate
              ? `${formatDateKST(project.startDate)} ~ ${formatDateKST(project.endDate)}`
              : null,
          }),
        }),
        isAiGenerated: true,
      });
    }

    return sections;
  } catch (error) {
    console.error("[BusinessPlan] Generate sections error:", error);
    throw new Error("Failed to generate business plan sections");
  }
}

/**
 * Build company context string for prompts
 */
function buildCompanyContext(company: {
  name: string;
  businessCategory: string | null;
  mainBusiness: string | null;
  establishedDate: Date | null;
  companyType: string | null;
  employeeCount: number | null;
  capitalAmount: bigint | null;
  isVenture: boolean;
  isInnoBiz: boolean;
  isMainBiz: boolean;
  financials: Array<{
    fiscalYear: number;
    revenue: bigint | null;
    operatingProfit: bigint | null;
  }>;
}): string {
  const certifications = [
    company.isVenture && "벤처기업 인증",
    company.isInnoBiz && "이노비즈 인증",
    company.isMainBiz && "메인비즈 인증",
  ].filter(Boolean).join(", ");

  const financials = company.financials
    .map((f) =>
      `${f.fiscalYear}년: 매출 ${f.revenue ? Number(f.revenue).toLocaleString() + "원" : "미정"}, 영업이익 ${f.operatingProfit ? Number(f.operatingProfit).toLocaleString() + "원" : "미정"}`
    )
    .join("\n- ");

  return `**기업 정보**:
- 기업명: ${company.name}
- 업종: ${company.businessCategory || "미정"}
- 주요 사업: ${company.mainBusiness || "미정"}
- 설립일: ${company.establishedDate ? formatDateKST(company.establishedDate) : "미정"}
- 기업 형태: ${company.companyType || "미정"}
- 종업원 수: ${company.employeeCount || "미정"}명
- 자본금: ${company.capitalAmount ? Number(company.capitalAmount).toLocaleString() + "원" : "미정"}
${certifications ? `- 보유 인증: ${certifications}` : ""}
${financials ? `\n**재무 현황** (최근 3년):\n- ${financials}` : ""}`;
}

/**
 * Build dynamic prompt based on section title and hints
 */
function buildDynamicPrompt(params: {
  sectionTitle: string;
  promptHint: string;
  companyContext: string;
  projectName: string;
  projectOrganization: string | null;
  newBusinessDescription: string;
  projectDateRange: string | null;
}): string {
  return `"${params.sectionTitle}" 섹션을 작성해주세요.

**작성 가이드**: ${params.promptHint}

**신규 사업 내용**: ${params.newBusinessDescription}

**지원사업**: ${params.projectName}${params.projectOrganization ? ` (${params.projectOrganization})` : ""}
${params.projectDateRange ? `**사업 기간**: ${params.projectDateRange}` : ""}

${params.companyContext}

위 정보를 바탕으로 해당 섹션의 내용을 전문적이고 설득력 있게 작성해주세요.`;
}

/**
 * Build RAG context with evaluation criteria, reference plans, and attachments (PRD 12.6)
 */
async function buildRagContext(input: {
  projectId: string;
  companyId: string;
  newBusinessDescription: string;
  referenceBusinessPlanIds?: string[];
  businessPlanId?: string;
}): Promise<{ context: string; evaluationCriteria: string }> {
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

    // Extract evaluation criteria from project embeddings
    const evaluationCriteria = await extractEvaluationCriteria(input.projectId);

    // Get reference business plans content
    let referencePlansContext = "";
    if (input.referenceBusinessPlanIds?.length) {
      const referencePlans = await prisma.businessPlan.findMany({
        where: { id: { in: input.referenceBusinessPlanIds } },
        include: { sections: { orderBy: { sectionIndex: "asc" } } },
      });

      referencePlansContext = referencePlans
        .map((plan) => {
          const sectionsText = plan.sections
            .map((s) => `### ${s.title}\n${s.content}`)
            .join("\n\n");
          return `## 참조 사업계획서: ${plan.title}\n${sectionsText}`;
        })
        .join("\n\n---\n\n");
    }

    // Get attachments content (if analyzed)
    let attachmentsContext = "";
    if (input.businessPlanId) {
      const attachments = await prisma.businessPlanAttachment.findMany({
        where: {
          businessPlanId: input.businessPlanId,
          isAnalyzed: true,
          extractedText: { not: null },
        },
      });

      if (attachments.length > 0) {
        attachmentsContext = attachments
          .map((a: { fileName: string; extractedText: string | null }) => `## 첨부 파일: ${a.fileName}\n${a.extractedText}`)
          .join("\n\n");
      }
    }

    // Combine context
    const context = `
## 지원사업 관련 정보
${projectContext || "정보 없음"}

## 기업 관련 정보
${companyContext || "정보 없음"}

${evaluationCriteria ? `## 평가 기준 (지원사업 공고문 기반)\n${evaluationCriteria}` : ""}

${referencePlansContext ? `## 참조 사업계획서\n${referencePlansContext}` : ""}

${attachmentsContext ? `## 첨부 자료 분석 결과\n${attachmentsContext}` : ""}
`.trim();

    return { context, evaluationCriteria };
  } catch (error) {
    console.error("[BusinessPlan] Build RAG context error:", error);
    return { context: "", evaluationCriteria: "" };
  }
}

/**
 * Extract evaluation criteria from project's embedded documents
 * Searches for keywords like: 평가기준, 심사기준, 배점기준, 평가항목
 */
async function extractEvaluationCriteria(projectId: string): Promise<string> {
  try {
    // First, check if project has direct evaluationCriteria field
    const project = await prisma.supportProject.findUnique({
      where: { id: projectId },
      select: { evaluationCriteria: true },
    });

    if (project?.evaluationCriteria) {
      return project.evaluationCriteria;
    }

    // Search in project embeddings for evaluation criteria
    const evaluationResults = await hybridSearch({
      queryText: "평가기준 심사기준 배점기준 평가항목 심사항목 선정기준",
      sourceType: "support_project",
      matchThreshold: 0.5,
      matchCount: 5,
      semanticWeight: 0.6,
    });

    // Filter results for this specific project
    const projectEvaluationResults = evaluationResults
      .filter((r) => r.sourceId === projectId)
      .slice(0, 3)
      .map((r) => r.content)
      .join("\n\n");

    return projectEvaluationResults || "";
  } catch (error) {
    console.error("[BusinessPlan] Extract evaluation criteria error:", error);
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
  evaluationCriteria?: string;
  prompt: string;
}): Promise<string> {
  try {
    const evaluationSection = params.evaluationCriteria
      ? `
## 평가 기준 (매우 중요 - 이 기준에 맞춰 작성하세요)
${params.evaluationCriteria}

평가 기준에 명시된 항목들을 충족하도록 내용을 구성하세요.`
      : "";

    const systemPrompt = `당신은 정부 지원사업 사업계획서 작성 전문가입니다.
다음 원칙을 준수하여 사업계획서를 작성해주세요:

1. 명확하고 구체적으로 작성
2. 지원사업의 목적과 평가 기준에 부합
3. 기업의 강점과 역량 강조
4. 실현 가능하고 구체적인 계획 제시
5. 전문적이고 설득력 있는 문체 사용
${evaluationSection}

RAG 컨텍스트:
${params.ragContext}`;

    const { text } = await generateText({
      model: google("gemini-3-pro-preview"),
      system: systemPrompt,
      prompt: params.prompt,
      // Temperature: Keep default 1.0 (recommended for Gemini 3)
      // 정부 지원사업 사업계획서 섹션은 보통 4000~8000 토큰이 필요
      maxOutputTokens: 8000,
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
 * Supports both default and dynamically extracted sections
 */
export async function regenerateSection(
  businessPlanId: string,
  sectionIndex: number
): Promise<string> {
  try {
    // Get business plan with company data
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

    // Build RAG context with evaluation criteria
    const { context: ragContext, evaluationCriteria } = await buildRagContext({
      projectId: businessPlan.projectId || "",
      companyId: businessPlan.companyId,
      newBusinessDescription: businessPlan.newBusinessDescription || "",
      businessPlanId: businessPlan.id,
    });

    // Build company context
    const companyContext = buildCompanyContext(businessPlan.company);

    // Build dynamic regeneration prompt
    const prompt = buildDynamicPrompt({
      sectionTitle: section.title,
      promptHint: `이전 내용을 참고하여 더 개선된 버전으로 재작성해주세요. 더 구체적이고 설득력 있게 작성하세요.`,
      companyContext,
      projectName: businessPlan.project?.name || "",
      projectOrganization: businessPlan.project?.organization || null,
      newBusinessDescription: businessPlan.newBusinessDescription || "",
      projectDateRange: businessPlan.project?.startDate && businessPlan.project?.endDate
        ? `${formatDateKST(businessPlan.project.startDate)} ~ ${formatDateKST(businessPlan.project.endDate)}`
        : null,
    });

    const content = await generateSection({
      sectionTitle: section.title,
      company: businessPlan.company,
      project: businessPlan.project,
      newBusinessDescription: businessPlan.newBusinessDescription || "",
      ragContext,
      evaluationCriteria,
      prompt,
    });

    return content;
  } catch (error) {
    console.error("[BusinessPlan] Regenerate section error:", error);
    throw new Error("Failed to regenerate section");
  }
}

/**
 * Generate embeddings for a completed business plan (PRD 12.4)
 * This makes the business plan searchable for future reference
 */
export async function generateBusinessPlanEmbeddings(
  businessPlanId: string
): Promise<void> {
  try {
    // Fetch the business plan with all sections
    const businessPlan = await prisma.businessPlan.findUnique({
      where: { id: businessPlanId },
      include: {
        sections: { orderBy: { sectionIndex: "asc" } },
        company: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    if (!businessPlan) {
      throw new Error("Business plan not found");
    }

    // Delete existing embeddings for this business plan
    await deleteEmbeddings("business_plan", businessPlanId);

    // Build full text content from all sections
    const fullContent = buildBusinessPlanContent(businessPlan);

    // Store embeddings with metadata
    await storeDocumentEmbeddings(
      "business_plan",
      businessPlanId,
      fullContent,
      {
        title: businessPlan.title,
        company_name: businessPlan.company?.name,
        project_name: businessPlan.project?.name,
        status: businessPlan.status,
        created_at: businessPlan.createdAt.toISOString(),
      }
    );

    console.log(
      `[BusinessPlan] Generated embeddings for business plan: ${businessPlanId}`
    );
  } catch (error) {
    console.error("[BusinessPlan] Generate embeddings error:", error);
    throw new Error("Failed to generate business plan embeddings");
  }
}

/**
 * Build searchable content from business plan sections
 */
function buildBusinessPlanContent(businessPlan: {
  title: string;
  newBusinessDescription?: string | null;
  additionalNotes?: string | null;
  sections: { title: string; content: string }[];
  company?: { name: string } | null;
  project?: { name: string } | null;
}): string {
  const parts: string[] = [];

  // Title and metadata
  parts.push(`# ${businessPlan.title}`);

  if (businessPlan.company?.name) {
    parts.push(`기업: ${businessPlan.company.name}`);
  }

  if (businessPlan.project?.name) {
    parts.push(`지원사업: ${businessPlan.project.name}`);
  }

  if (businessPlan.newBusinessDescription) {
    parts.push(`\n## 신규 사업 개요\n${businessPlan.newBusinessDescription}`);
  }

  // All sections
  for (const section of businessPlan.sections) {
    parts.push(`\n## ${section.title}\n${section.content}`);
  }

  if (businessPlan.additionalNotes) {
    parts.push(`\n## 추가 참고사항\n${businessPlan.additionalNotes}`);
  }

  return parts.join("\n");
}
