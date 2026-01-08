import { PrismaClient } from "@prisma/client";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const prisma = new PrismaClient();

interface AIAnalysisResult {
  summary?: string;
  description?: string;
  target?: string;
  eligibility?: string;
  applicationProcess?: string;
  evaluationCriteria?: string;
  fundingSummary?: string;
  amountDescription?: string;
  amountMin?: number;
  amountMax?: number;
  deadline?: string;
  startDate?: string;
  endDate?: string;
}

async function analyzeWithGemini(text: string): Promise<AIAnalysisResult | null> {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log("⚠️ Gemini API key not configured");
      return null;
    }

    const model = google("gemini-2.0-flash");

    const prompt = `다음은 정부 지원사업 공고문입니다. 아래 정보를 JSON 형식으로 추출해주세요:

1. summary: 사업 요약 (1문장, 30~50자, 핵심 내용만. 예: "창업 3년 이내 기업 대상 최대 1억원 지원")
2. description: 사업의 목적과 개요. 항목별로 줄바꿈(\\n)으로 구분하여 가독성 있게 작성.
3. target: 지원 대상 (어떤 기업/단체가 신청 가능한지. 예: "창업 3년 이내 중소기업", "제조업 영위 기업")
4. eligibility: 신청 자격 요건. 항목별로 줄바꿈(\\n)으로 구분.
5. applicationProcess: 신청 방법 및 절차 (간단히, 있는 경우)
6. evaluationCriteria: 평가 기준 (있는 경우)
7. fundingSummary: 지원 금액을 한 줄로 간결하게 요약 (예: "최대 400만원", "업체당 500만원 이내"). 10~30자 이내.
8. amountDescription: 지원 금액에 대한 상세 설명. 세부 항목별 금액, 지원 조건, 자부담 비율 등 포함.
9. amountMin: 최소 지원 금액 (원화 숫자만, 예: 5000000). 범위가 있는 경우 최소값, 없으면 생략.
10. amountMax: 최대 지원 금액 (원화 숫자만, 예: 100000000). "최대 1억원"이면 100000000.
11. deadline: 신청 마감일 (YYYY-MM-DD 형식, 있는 경우)
12. startDate: 사업/접수 시작일 (YYYY-MM-DD 형식, 있는 경우)
13. endDate: 사업/접수 종료일 (YYYY-MM-DD 형식, 있는 경우)

중요: amountMin, amountMax는 반드시 숫자(number)로 반환하세요. 문자열이 아닌 순수 숫자입니다.

응답은 반드시 다음 JSON 형식으로만 작성해주세요:
{
  "summary": "...",
  "description": "사업 목적\\n지원 내용\\n기대 효과",
  "target": "창업 3년 이내 중소기업",
  "eligibility": "자격요건1\\n자격요건2",
  "applicationProcess": "...",
  "evaluationCriteria": "...",
  "fundingSummary": "...",
  "amountDescription": "...",
  "amountMin": 5000000,
  "amountMax": 100000000,
  "deadline": "2025-12-31",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}

정보가 없는 항목은 생략하세요. 날짜는 반드시 YYYY-MM-DD 형식으로, 금액은 반드시 숫자로 작성하세요.

원문:
${text}`;

    const { text: result } = await generateText({
      model,
      prompt,
      temperature: 0.1,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("⚠️ Failed to extract JSON from response");
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    console.error("❌ Gemini analysis failed:", error.message);
    return null;
  }
}

async function main() {
  console.log("🔄 최근 크롤링된 10개 프로젝트 AI 재분석 시작...\n");

  const projects = await prisma.supportProject.findMany({
    where: {
      deletedAt: null,
      crawledAt: { not: null },
    },
    orderBy: { crawledAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      summary: true,
      description: true,
      target: true,
      eligibility: true,
      fundingSummary: true,
      amountMin: true,
      amountMax: true,
      crawledAt: true,
    },
  });

  console.log(`📋 ${projects.length}개 프로젝트 조회됨\n`);

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    console.log(`\n[${ i + 1}/${projects.length}] ${project.name}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   크롤링: ${project.crawledAt?.toISOString()}`);
    console.log(`   현재 target: ${project.target}`);
    console.log(`   현재 summary: ${project.summary?.substring(0, 50)}...`);

    const textToAnalyze = [
      project.name,
      project.summary,
      project.description,
      project.eligibility,
    ].filter(Boolean).join("\n\n");

    if (textToAnalyze.length < 50) {
      console.log("   ⚠️ 분석할 텍스트 부족, 스킵");
      continue;
    }

    console.log("   🤖 AI 분석 중...");
    const analysis = await analyzeWithGemini(textToAnalyze);

    if (!analysis) {
      console.log("   ❌ AI 분석 실패");
      continue;
    }

    const parseDate = (dateStr?: string): Date | undefined => {
      if (!dateStr) return undefined;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? undefined : date;
    };

    const parseBigInt = (amount?: number): bigint | undefined => {
      if (amount === undefined || amount === null || isNaN(amount)) return undefined;
      return BigInt(Math.round(amount));
    };

    await prisma.supportProject.update({
      where: { id: project.id },
      data: {
        summary: analysis.summary || undefined,
        description: analysis.description || undefined,
        target: analysis.target || undefined,
        eligibility: analysis.eligibility || undefined,
        applicationProcess: analysis.applicationProcess || undefined,
        evaluationCriteria: analysis.evaluationCriteria || undefined,
        fundingSummary: analysis.fundingSummary || undefined,
        amountDescription: analysis.amountDescription || undefined,
        amountMin: parseBigInt(analysis.amountMin),
        amountMax: parseBigInt(analysis.amountMax),
        deadline: parseDate(analysis.deadline),
        startDate: parseDate(analysis.startDate),
        endDate: parseDate(analysis.endDate),
      },
    });

    console.log("   ✅ 업데이트 완료");
    console.log(`   → target: ${analysis.target || "(없음)"}`);
    console.log(`   → summary: ${analysis.summary?.substring(0, 50) || "(없음)"}...`);
    console.log(`   → fundingSummary: ${analysis.fundingSummary || "(없음)"}`);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n✅ 모든 프로젝트 재분석 완료!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
