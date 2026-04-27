/**
 * Project Analyzer - AI 기반 지원사업 공고 분석
 *
 * 크롤링된 프로젝트 데이터를 GPT-4o-mini로 분석하여
 * 구조화된 마크다운으로 변환
 *
 * @module lib/crawler/project-analyzer
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { ProjectAnalysisSchema, type ProjectAnalysis } from "@/lib/projects/analysis-schema";

const logger = createLogger({ lib: "project-analyzer" });

/**
 * Structured eligibility criteria extracted from project text
 */
export interface EligibilityCriterion {
  value: string | number | string[];
  confidence: "high" | "medium";
}

export interface EligibilityCriteria {
  maxCompanyAge?: EligibilityCriterion;    // 업력 상한 (년)
  minCompanyAge?: EligibilityCriterion;    // 업력 하한 (년)
  requiredRegions?: EligibilityCriterion & { type: "include" | "exclude" };
  companySize?: EligibilityCriterion;      // 중소기업, 중견기업 등
  requiredCerts?: EligibilityCriterion;    // 벤처, 이노비즈 등
  maxRevenue?: EligibilityCriterion;       // 매출 상한 (원)
  minRevenue?: EligibilityCriterion;       // 매출 하한 (원)
  maxEmployees?: EligibilityCriterion;     // 종업원 수 상한
  minEmployees?: EligibilityCriterion;     // 종업원 수 하한
  industryRestriction?: EligibilityCriterion & { type: "include" | "exclude" };
}

interface EligibilityExtractionResult {
  criteria: EligibilityCriteria;
  succeeded: boolean;
}

/**
 * AI prompt for extracting structured eligibility criteria
 */
const ELIGIBILITY_EXTRACTION_PROMPT = `당신은 정부 지원사업 공고에서 신청 자격 조건을 구조화하여 추출하는 전문가입니다.

## 역할
주어진 공고의 "지원대상", "신청자격" 텍스트에서 **명확한 필수 조건**을 JSON으로 추출하세요.

## 추출 규칙

1. **confidence 판단 기준**:
   - "high": 명확한 수치/조건이 있는 경우 ("창업 3년 이내", "수도권 제외", "벤처기업 한정")
   - "medium": 해석 여지가 있는 경우 ("SW 분야 기업", "기술기반 기업")

2. **필수 vs 우대 구분**:
   - "~만 가능", "~에 한함", "~이어야 함", "~제외" → 필수조건으로 추출
   - "~우대", "~가점", "~우선" → 추출하지 않음 (우대사항은 제외)

3. **추출하지 않는 경우**:
   - 조건이 명시되지 않은 항목은 포함하지 마세요
   - "중소기업" 같은 매우 일반적인 대상은 companySize에 포함하되 confidence="medium"

## 출력 형식 (JSON)

{
  "maxCompanyAge": { "value": 3, "confidence": "high" },
  "requiredRegions": { "value": ["경북", "경남"], "type": "include", "confidence": "high" },
  "companySize": { "value": ["중소기업"], "confidence": "medium" },
  "requiredCerts": { "value": ["벤처기업"], "confidence": "high" },
  "industryRestriction": { "value": ["제조업", "IT"], "type": "include", "confidence": "medium" }
}

조건이 없으면 빈 객체 {}를 반환하세요. JSON만 출력하세요.`;

/**
 * AI 분석용 프롬프트
 */
const PROJECT_ANALYSIS_PROMPT = `당신은 정부 지원사업 공고를 분석하는 전문가입니다.
다음 공고 내용을 분석하여 구조화된 마크다운으로 정리해주세요.

## 출력 규칙
1. 제공된 정보만 사용하세요. 없는 정보는 "정보 없음"이라고 쓰지 말고 해당 섹션을 생략하세요.
2. 원본 텍스트의 핵심 정보를 유지하되, 가독성 좋게 정리하세요.
3. 금액, 날짜, 연락처 등 중요 정보는 정확히 보존하세요.
4. 불필요한 반복이나 형식적 문구는 제거하세요.
5. 마크다운 형식을 준수하세요 (제목, 리스트, 테이블 등).

## 출력 형식

### 사업개요
[사업의 목적과 주요 내용 요약 - 2~3문장]

### 지원내용
| 항목 | 내용 |
|-----|------|
| 지원금액 | ... |
| 지원기간 | ... |
| 지원방식 | ... |
(해당하는 항목만 포함)

### 지원대상
- [대상 1]
- [대상 2]
(해당하는 경우만 포함)

### 신청방법
1. [단계 1]
2. [단계 2]
(구체적인 절차가 있는 경우)

### 제출서류
- [서류 1]
- [서류 2]
(구체적인 서류 목록이 있는 경우)

### 문의처
- 담당부서: ...
- 연락처: ...
- 홈페이지: ...
(해당하는 정보만 포함)

## 주의사항
- 내용이 없거나 불명확한 섹션은 완전히 생략하세요.
- "정보 없음", "미정", "추후 공지" 등의 표현은 사용하지 마세요.
- 원본에 명시된 정확한 수치와 날짜를 사용하세요.`;

/**
 * 프로젝트의 첨부파일 파싱 결과 통합
 */
export async function integrateAttachmentContent(
  projectId: string
): Promise<string | null> {
  const attachments = await prisma.projectAttachment.findMany({
    where: {
      projectId,
      isParsed: true,
      parsedContent: { not: null },
    },
    select: {
      fileName: true,
      parsedContent: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (attachments.length === 0) {
    return null;
  }

  const contents = attachments
    .filter((a) => a.parsedContent && a.parsedContent.trim().length > 0)
    .map((a) => `[${a.fileName}]\n${a.parsedContent}`)
    .join("\n\n---\n\n");

  return contents.length > 0 ? contents : null;
}

/**
 * 크롤링 데이터를 AI용 텍스트로 변환
 */
function formatCrawledData(project: {
  name: string;
  summary: string;
  description: string | null;
  eligibility: string | null;
  applicationProcess: string | null;
  evaluationCriteria: string | null;
  target: string;
  fundingSummary: string | null;
  amountDescription: string | null;
  contactInfo: string | null;
  requiredDocuments: string[];
}): string {
  const parts: string[] = [];

  parts.push(`# ${project.name}`);
  parts.push(`\n## 요약\n${project.summary}`);

  if (project.target) {
    parts.push(`\n## 지원대상\n${project.target}`);
  }

  if (project.description) {
    parts.push(`\n## 상세내용\n${project.description}`);
  }

  if (project.eligibility) {
    parts.push(`\n## 신청자격\n${project.eligibility}`);
  }

  if (project.applicationProcess) {
    parts.push(`\n## 신청방법\n${project.applicationProcess}`);
  }

  if (project.fundingSummary || project.amountDescription) {
    const funding = [project.fundingSummary, project.amountDescription]
      .filter(Boolean)
      .join("\n");
    parts.push(`\n## 지원금액\n${funding}`);
  }

  if (project.requiredDocuments.length > 0) {
    parts.push(`\n## 제출서류\n${project.requiredDocuments.join("\n")}`);
  }

  if (project.evaluationCriteria) {
    parts.push(`\n## 평가기준\n${project.evaluationCriteria}`);
  }

  if (project.contactInfo) {
    parts.push(`\n## 문의처\n${project.contactInfo}`);
  }

  return parts.join("\n");
}

/**
 * GPT-4o-mini로 마크다운 생성
 * Memory Optimization (2025.02): 프롬프트 변수 명시적 해제
 */
export async function generateProjectMarkdown(
  crawledData: string,
  attachmentContent: string | null
): Promise<string> {
  let userPrompt: string | null = attachmentContent
    ? `크롤링 데이터:\n${crawledData}\n\n---\n\n첨부파일 내용:\n${attachmentContent}`
    : `크롤링 데이터:\n${crawledData}`;

  // 컨텍스트 길이 제한 (약 100K 토큰 제한, 안전하게 80K 문자로 제한)
  const truncatedPrompt =
    userPrompt.length > 80000 ? userPrompt.slice(0, 80000) + "\n\n..." : userPrompt;

  // Memory Optimization: 원본 프롬프트 해제
  userPrompt = null;

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: PROJECT_ANALYSIS_PROMPT,
    prompt: truncatedPrompt,
    maxOutputTokens: 4000,
  });

  return text;
}

/**
 * Extract structured eligibility criteria from project text using GPT-4o-mini
 */
function deriveAnalysisConfidence(criteriaCount: number, hasAttachmentContent: boolean): "high" | "medium" | "low" {
  if (criteriaCount > 0 && hasAttachmentContent) return "high";
  if (criteriaCount > 0) return "medium";
  return "low";
}

function buildProjectAnalysis(input: {
  project: {
    summary: string;
    target: string;
    fundingSummary: string | null;
    amountDescription: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    deadline?: Date | null;
    isPermanent?: boolean;
    applicationProcess: string | null;
    evaluationCriteria: string | null;
    requiredDocuments: string[];
    contactInfo: string | null;
  };
  markdown: string;
  eligibilityCriteria: EligibilityCriteria;
  hasAttachmentContent: boolean;
}): ProjectAnalysis {
  const criteriaEntries = Object.entries(input.eligibilityCriteria);
  const confidence = deriveAnalysisConfidence(criteriaEntries.length, input.hasAttachmentContent);
  const evidenceIds = criteriaEntries.map(([key]) => key);

  const benefits: ProjectAnalysis["benefits"] = {
    maxAmount: null,
    nonCashBenefits: [],
    notes: input.project.amountDescription ? [input.project.amountDescription] : [],
  };
  if (input.project.fundingSummary) benefits.cash = input.project.fundingSummary;

  const period: ProjectAnalysis["period"] = {
    isOpenEnded: Boolean(input.project.isPermanent),
    status: input.project.isPermanent ? "open" : input.project.deadline ? "open" : "unknown",
  };
  if (input.project.startDate) period.startDate = input.project.startDate.toISOString();
  if (input.project.endDate) period.endDate = input.project.endDate.toISOString();

  return {
    summary: {
      plain: input.project.summary,
      keyPoints: [input.project.target, input.project.fundingSummary].filter(Boolean) as string[],
    },
    benefits,
    eligibility: {
      required: criteriaEntries.map(([key, value]) => ({
        label: key,
        description: Array.isArray(value.value) ? value.value.join(", ") : String(value.value),
        confidence: value.confidence,
        evidenceIds: [key],
        notes: [],
      })),
      preferred: [],
      excluded: [],
      ambiguous: [],
    },
    period,
    application: {
      method: input.project.applicationProcess ? [input.project.applicationProcess] : [],
      channels: [],
      requiredDocuments: input.project.requiredDocuments,
      contact: input.project.contactInfo ? [input.project.contactInfo] : [],
    },
    selection: {
      criteria: input.project.evaluationCriteria ? [input.project.evaluationCriteria] : [],
      scoringHints: [],
      likelyImportantFactors: [],
    },
    aiTips: {
      whoShouldApply: [input.project.target],
      preparationPriority: input.project.requiredDocuments,
      writingStrategy: [],
      commonRisks: [],
      checklist: [],
    },
    evidence: evidenceIds.map((id) => ({ id, source: "ai", label: id, text: id })),
    quality: {
      confidence,
      hasParsedAttachment: input.hasAttachmentContent,
      hasSelectionCriteria: Boolean(input.project.evaluationCriteria),
      missingFields: [],
      warnings: [],
    },
  };
}

export async function extractEligibilityCriteria(
  target: string,
  eligibility: string | null,
  description: string | null
): Promise<EligibilityExtractionResult> {
  try {
    const inputText = [
      `지원대상: ${target}`,
      eligibility ? `신청자격: ${eligibility}` : null,
      description ? `상세내용 (참고): ${description.slice(0, 3000)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: ELIGIBILITY_EXTRACTION_PROMPT,
      prompt: inputText,
      maxOutputTokens: 1000,
    });

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return { criteria: parsed as EligibilityCriteria, succeeded: true };
  } catch (error) {
    logger.warn("Failed to extract eligibility criteria", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { criteria: {}, succeeded: false };
  }
}

/**
 * 단일 프로젝트 분석
 * Memory Optimization (2025.02): 중간 변수 명시적 해제
 */
export async function analyzeProject(projectId: string): Promise<{
  success: boolean;
  markdown?: string;
  error?: string;
}> {
  try {
    const project = await prisma.supportProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        eligibility: true,
        applicationProcess: true,
        evaluationCriteria: true,
        target: true,
        fundingSummary: true,
        amountDescription: true,
        contactInfo: true,
        requiredDocuments: true,
        startDate: true,
        endDate: true,
        deadline: true,
        isPermanent: true,
        analysisVersion: true,
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const projectName = project.name;
    const analysisVersion = project.analysisVersion;
    logger.info(`Analyzing project: ${projectName}`);

    // 크롤링 데이터 포맷팅
    let crawledData: string | null = formatCrawledData(project);

    // 첨부파일 파싱 결과 통합
    let attachmentContent: string | null = await integrateAttachmentContent(projectId);

    const hasAttachmentContent = Boolean(attachmentContent?.trim());

    // AI 마크다운 생성 + 필수조건 추출 (병렬 실행)
    const [markdown, eligibilityExtraction] = await Promise.all([
      generateProjectMarkdown(crawledData, attachmentContent),
      extractEligibilityCriteria(project.target, project.eligibility, project.description),
    ]);
    const eligibilityCriteria = eligibilityExtraction.criteria;

    const projectAnalysis = ProjectAnalysisSchema.parse(buildProjectAnalysis({
      project,
      markdown,
      eligibilityCriteria,
      hasAttachmentContent,
    }));
    const hasExtractedCriteria = Object.keys(eligibilityCriteria).length > 0;

    // Memory Optimization: 중간 데이터 해제
    crawledData = null;
    attachmentContent = null;

    // 결과 저장 (markdown + eligibility criteria)
    await prisma.supportProject.update({
      where: { id: projectId },
      data: {
        descriptionMarkdown: markdown,
        projectAnalysis: projectAnalysis as unknown as Prisma.InputJsonValue,
        analysisStatus: "analyzed",
        analysisConfidence: projectAnalysis.quality.confidence,
        hasParsedAttachment: projectAnalysis.quality.hasParsedAttachment,
        hasSelectionCriteria: projectAnalysis.quality.hasSelectionCriteria,
        publicationStatus: "visible",
        eligibilityCriteria: eligibilityExtraction.succeeded
          ? (eligibilityCriteria as unknown as Prisma.InputJsonValue)
          : undefined,
        criteriaExtractedAt: eligibilityExtraction.succeeded ? new Date() : undefined,
        criteriaVersion: eligibilityExtraction.succeeded ? { increment: 1 } : undefined,
        needsAnalysis: false,
        analyzedAt: new Date(),
        analysisVersion: analysisVersion + 1,
        needsEmbedding: true, // 분석 완료 후 임베딩 재생성 필요
      },
    });

    logger.info(`Analysis complete for project: ${projectName}`, {
      criteriaExtracted: Object.keys(eligibilityCriteria).length,
    });

    return { success: true, markdown };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Analysis failed for project ${projectId}`, { error: errorMessage });
    await prisma.supportProject.update({
      where: { id: projectId },
      data: {
        analysisStatus: "failed",
        needsAnalysis: true,
      },
    }).catch(() => undefined);
    return { success: false, error: errorMessage };
  }
}

/**
 * 분석 필요한 프로젝트 배치 조회
 */
export async function getProjectsNeedingAnalysis(batchSize: number = 50): Promise<
  Array<{
    id: string;
    name: string;
  }>
> {
  return prisma.supportProject.findMany({
    where: {
      needsAnalysis: true,
      deletedAt: null,
      // description이 있어야 분석 의미가 있음
      description: { not: null },
    },
    select: {
      id: true,
      name: true,
    },
    take: batchSize,
    orderBy: {
      crawledAt: "desc", // 최근 크롤링된 프로젝트부터 분석
    },
  });
}

/**
 * 배치 분석 실행
 */
export async function analyzeProjectsBatch(
  projectIds: string[]
): Promise<{
  total: number;
  success: number;
  failed: number;
  errors: Array<{ projectId: string; error: string }>;
}> {
  const result = {
    total: projectIds.length,
    success: 0,
    failed: 0,
    errors: [] as Array<{ projectId: string; error: string }>,
  };

  for (const projectId of projectIds) {
    const analysis = await analyzeProject(projectId);

    if (analysis.success) {
      result.success++;
    } else {
      result.failed++;
      result.errors.push({ projectId, error: analysis.error || "Unknown error" });
    }

    // Rate limiting - OpenAI API 부하 방지
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return result;
}
