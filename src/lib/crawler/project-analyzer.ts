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
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "project-analyzer" });

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
 */
export async function generateProjectMarkdown(
  crawledData: string,
  attachmentContent: string | null
): Promise<string> {
  const userPrompt = attachmentContent
    ? `크롤링 데이터:\n${crawledData}\n\n---\n\n첨부파일 내용:\n${attachmentContent}`
    : `크롤링 데이터:\n${crawledData}`;

  // 컨텍스트 길이 제한 (약 100K 토큰 제한, 안전하게 80K 문자로 제한)
  const truncatedPrompt =
    userPrompt.length > 80000 ? userPrompt.slice(0, 80000) + "\n\n..." : userPrompt;

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: PROJECT_ANALYSIS_PROMPT,
    prompt: truncatedPrompt,
    maxOutputTokens: 4000,
  });

  return text;
}

/**
 * 단일 프로젝트 분석
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
        analysisVersion: true,
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    logger.info(`Analyzing project: ${project.name}`);

    // 크롤링 데이터 포맷팅
    const crawledData = formatCrawledData(project);

    // 첨부파일 파싱 결과 통합
    const attachmentContent = await integrateAttachmentContent(projectId);

    // AI 마크다운 생성
    const markdown = await generateProjectMarkdown(crawledData, attachmentContent);

    // 결과 저장
    await prisma.supportProject.update({
      where: { id: projectId },
      data: {
        descriptionMarkdown: markdown,
        needsAnalysis: false,
        analyzedAt: new Date(),
        analysisVersion: project.analysisVersion + 1,
        needsEmbedding: true, // 분석 완료 후 임베딩 재생성 필요
      },
    });

    logger.info(`Analysis complete for project: ${project.name}`);

    return { success: true, markdown };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Analysis failed for project ${projectId}`, { error: errorMessage });
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
      updatedAt: "desc",
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
