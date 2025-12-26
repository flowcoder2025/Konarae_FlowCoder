/**
 * AI Evaluation Engine (PRD 12.6)
 * Evaluates business plans against support project criteria using Gemini 3.0
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { prisma } from "./prisma";
import { hybridSearch } from "./rag";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "evaluation-engine" });

export interface EvaluationInput {
  businessPlanId?: string;
  uploadedContent?: string;
  criteria: string;
}

export interface EvaluationFeedbackData {
  criteriaName: string;
  score: number;
  feedback: string;
  suggestions: string[];
}

export interface EvaluationResult {
  totalScore: number;
  feedbacks: EvaluationFeedbackData[];
}

/**
 * Parse evaluation criteria from text
 */
export function parseCriteria(criteriaText: string): string[] {
  // Split by common delimiters and clean
  const criteria = criteriaText
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // Extract numbered items (1. 2. etc) or bullet points
  const numberedItems = criteria
    .map((line) => {
      const match = line.match(/^[\d\-\*\•]+[\.\):\s]+(.+)$/);
      return match ? match[1].trim() : line;
    })
    .filter((line) => line.length > 5); // Minimum meaningful criteria length

  return numberedItems.length > 0 ? numberedItems : criteria;
}

/**
 * Evaluate business plan against criteria using AI
 */
export async function evaluateBusinessPlan(
  input: EvaluationInput
): Promise<EvaluationResult> {
  try {
    // Get business plan content
    let planContent = "";
    if (input.businessPlanId) {
      const businessPlan = await prisma.businessPlan.findUnique({
        where: { id: input.businessPlanId },
        include: {
          company: true,
          project: true,
          sections: {
            orderBy: { sectionIndex: "asc" },
          },
        },
      });

      if (!businessPlan) {
        throw new Error("Business plan not found");
      }

      // Build plan content
      planContent = buildPlanContent(businessPlan);
    } else if (input.uploadedContent) {
      planContent = input.uploadedContent;
    } else {
      throw new Error("Either businessPlanId or uploadedContent is required");
    }

    // Parse criteria
    const criteriaList = parseCriteria(input.criteria);

    // Build RAG context for evaluation
    const ragContext = await buildEvaluationContext(planContent, input.criteria);

    // Evaluate each criterion
    const feedbacks: EvaluationFeedbackData[] = [];

    for (const criterion of criteriaList) {
      const feedback = await evaluateCriterion({
        criterion,
        planContent,
        ragContext,
      });

      feedbacks.push({
        criteriaName: criterion,
        score: feedback.score,
        feedback: feedback.feedback,
        suggestions: feedback.suggestions,
      });
    }

    // Calculate total score (weighted average)
    const totalScore = Math.round(
      feedbacks.reduce((sum, f) => sum + (f.score || 0), 0) / feedbacks.length
    );

    return {
      totalScore,
      feedbacks,
    };
  } catch (error) {
    logger.error("Evaluate business plan error", { error });
    throw new Error("Failed to evaluate business plan");
  }
}

/**
 * Build business plan content for evaluation
 */
function buildPlanContent(businessPlan: any): string {
  let content = `# ${businessPlan.title}\n\n`;
  content += `**기업**: ${businessPlan.company.name}\n`;
  content += `**지원사업**: ${businessPlan.project?.name || "미정"}\n\n`;

  for (const section of businessPlan.sections) {
    content += `## ${section.title}\n\n`;
    content += `${section.content}\n\n`;
  }

  return content;
}

/**
 * Build RAG context for evaluation
 */
async function buildEvaluationContext(
  planContent: string,
  criteria: string
): Promise<string> {
  try {
    // Search for similar evaluation criteria and best practices
    const searchResults = await hybridSearch({
      queryText: `${criteria}\n\n${planContent.substring(0, 500)}`,
      sourceType: "support_project",
      matchThreshold: 0.5,
      matchCount: 5,
      semanticWeight: 0.6,
    });

    const context = searchResults
      .slice(0, 3)
      .map((r) => r.content)
      .join("\n\n");

    return context || "추가 컨텍스트 없음";
  } catch (error) {
    logger.error("Build RAG context error", { error });
    return "";
  }
}

/**
 * Evaluate single criterion using Gemini
 */
async function evaluateCriterion(params: {
  criterion: string;
  planContent: string;
  ragContext: string;
}): Promise<{
  score: number;
  feedback: string;
  suggestions: string[];
}> {
  try {
    const systemPrompt = `당신은 정부 지원사업 사업계획서 평가 전문가입니다.

다음 원칙을 준수하여 사업계획서를 평가해주세요:

1. **객관적 평가**: 제시된 평가 기준에 따라 객관적으로 평가
2. **구체적 피드백**: 단순히 좋다/나쁘다가 아닌 구체적인 근거 제시
3. **건설적 제안**: 점수가 낮은 경우 구체적인 개선 방향 제시
4. **균형잡힌 시각**: 강점과 약점을 모두 언급

RAG 컨텍스트 (참고용):
${params.ragContext}`;

    const prompt = `다음 평가 기준에 따라 사업계획서를 평가해주세요:

**평가 기준**: ${params.criterion}

**사업계획서 내용**:
${params.planContent}

다음 JSON 형식으로 평가 결과를 작성해주세요:
{
  "score": 0-100 점수,
  "feedback": "평가 기준에 대한 상세한 피드백 (2-3문장)",
  "suggestions": ["개선 제안 1", "개선 제안 2", "개선 제안 3"]
}

IMPORTANT: 반드시 유효한 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`;

    const { text } = await generateText({
      model: google("gemini-3-pro-preview"),
      system: systemPrompt,
      prompt,
      // Temperature: Keep default 1.0 (recommended for Gemini 3)
      maxOutputTokens: 1500,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 8192, // High reasoning budget for evaluation and structured JSON output
            includeThoughts: false, // Internal reasoning only
          },
        },
      },
    });

    // Parse JSON response
    const cleanText = text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const result = JSON.parse(cleanText);

    return {
      score: Math.max(0, Math.min(100, result.score || 0)), // Clamp to 0-100
      feedback: result.feedback || "평가 피드백 생성 실패",
      suggestions: Array.isArray(result.suggestions)
        ? result.suggestions.slice(0, 5)
        : [],
    };
  } catch (error) {
    logger.error(`Evaluate criterion "${params.criterion}" error`, { error });

    // Fallback response
    return {
      score: 50,
      feedback: `[AI 평가 실패] "${params.criterion}" 항목을 자동으로 평가할 수 없습니다. 수동 평가가 필요합니다.`,
      suggestions: ["전문가 검토 요청", "평가 기준 재확인"],
    };
  }
}
