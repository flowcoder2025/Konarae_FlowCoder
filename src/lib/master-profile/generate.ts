/**
 * AI 기반 마스터 프로필 블록 생성
 * Gemini를 사용하여 문서 분석 결과를 블록으로 변환
 */

import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { createLogger } from "@/lib/logger"
import { BLOCK_CATEGORIES } from "./constants"
import type {
  DocumentAnalysisInput,
  GeneratedBlock,
  BlockGenerationResult,
  ProfileBlockCategory,
  ProfileBlockMetadata,
} from "./types"

const logger = createLogger({ lib: "master-profile-generate" })

// ============================================
// 프롬프트 템플릿
// ============================================

const MASTER_PROFILE_PROMPT = `당신은 기업 사업계획서 작성을 위한 전문 비즈니스 컨설턴트입니다.
주어진 기업 문서 분석 결과들을 바탕으로, 사업계획서에 바로 활용할 수 있는 **콘텐츠 블록**을 생성해주세요.

## 블록 카테고리 (8종)
1. **company_overview** (회사 개요): 기본 정보, 설립 배경, 연혁
2. **business_description** (사업 내용): 주요 사업, 제품/서비스, 비전
3. **financials** (재무 현황): 매출, 자본금, 재무 건전성
4. **human_resources** (인력 현황): 조직 구성, 핵심 인력
5. **certifications** (인증 현황): 보유 인증, 자격, 지정 현황
6. **achievements** (실적/성과): 사업 실적, 수출, 특허, 수상
7. **capabilities** (핵심 역량): 기술력, 차별화 포인트, 경쟁력
8. **market_position** (시장 포지션): 시장 현황, 경쟁 환경, 성장 가능성

## 출력 형식
각 카테고리별로 1~3개의 블록을 생성합니다. 블록은 마크다운 형식으로 작성합니다.

\`\`\`json
{
  "blocks": [
    {
      "category": "company_overview",
      "title": "기본 정보",
      "blockOrder": 0,
      "content": "## 기업 개요\\n\\n- **회사명**: (주)코나래\\n- **설립일**: 2020년 3월 15일\\n...",
      "contentType": "markdown",
      "sourceDocumentTypes": ["business_registration"]
    },
    {
      "category": "business_description",
      "title": "주요 사업 영역",
      "blockOrder": 0,
      "content": "## 사업 영역\\n\\n### 1. AI 기반 매칭 플랫폼\\n...",
      "contentType": "markdown",
      "sourceDocumentTypes": ["company_introduction"]
    }
  ],
  "confidenceScore": 0.85
}
\`\`\`

## 작성 가이드라인
1. **정확성**: 문서에서 추출된 데이터만 사용, 추측 금지
2. **구조화**: 마크다운 헤더, 리스트, 표 등을 활용하여 가독성 확보
3. **전문성**: 사업계획서에 적합한 비즈니스 용어와 표현 사용
4. **완결성**: 각 블록이 독립적으로 의미를 전달할 수 있도록 작성
5. **재사용성**: 다양한 사업계획서 섹션에 활용 가능하도록 범용적 작성

## 주의사항
- 데이터가 부족한 카테고리는 생성하지 마세요
- 숫자, 날짜, 금액 등은 정확하게 기재하세요
- 민감 정보(주민번호, 계좌번호 등)는 제외하세요`

// ============================================
// 블록 생성 메인 함수
// ============================================

/**
 * 문서 분석 결과들을 기반으로 프로필 블록 생성
 */
export async function generateProfileBlocks(
  documents: DocumentAnalysisInput[],
  companyName: string
): Promise<BlockGenerationResult> {
  const startTime = Date.now()

  try {
    // 문서 데이터를 프롬프트용으로 정리
    const documentSummary = formatDocumentsForPrompt(documents)

    // Gemini API 호출
    const model = google("gemini-3-flash-preview")

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "system",
          content: MASTER_PROFILE_PROMPT,
        },
        {
          role: "user",
          content: `## 기업명: ${companyName}

## 분석된 문서 데이터

${documentSummary}

위 문서 데이터를 바탕으로 마스터 프로필 블록을 생성해주세요.`,
        },
      ],
      temperature: 0.3, // 일관성 유지
    })

    // JSON 파싱
    const result = parseGenerationResponse(text, documents)

    if (!result) {
      throw new Error("AI 응답 파싱 실패")
    }

    const processingTime = Date.now() - startTime

    logger.info("Profile blocks generated", {
      companyName,
      blockCount: result.blocks.length,
      processingTime,
    })

    return {
      blocks: result.blocks,
      confidenceScore: result.confidenceScore,
      processingTime,
    }
  } catch (error) {
    logger.error("generateProfileBlocks error", { error, companyName })
    throw error
  }
}

// ============================================
// 문서 포맷팅
// ============================================

/**
 * 문서 분석 결과를 프롬프트용 텍스트로 변환
 */
function formatDocumentsForPrompt(documents: DocumentAnalysisInput[]): string {
  const sections: string[] = []

  for (const doc of documents) {
    const docTypeName = getDocumentTypeName(doc.documentType)

    let section = `### ${docTypeName} (${doc.documentType})\n\n`
    section += `**요약**: ${doc.summary}\n\n`

    if (doc.keyInsights && doc.keyInsights.length > 0) {
      section += `**핵심 인사이트**:\n`
      doc.keyInsights.forEach((insight) => {
        section += `- ${insight}\n`
      })
      section += "\n"
    }

    // extractedData를 읽기 쉬운 형태로 변환
    if (doc.extractedData && typeof doc.extractedData === "object") {
      section += `**추출 데이터**:\n\`\`\`json\n${JSON.stringify(doc.extractedData, null, 2)}\n\`\`\`\n`
    }

    sections.push(section)
  }

  return sections.join("\n---\n\n")
}

/**
 * 문서 유형 ID를 한글 이름으로 변환
 */
function getDocumentTypeName(type: string): string {
  const typeNames: Record<string, string> = {
    business_registration: "사업자등록증",
    corporation_registry: "법인등기부등본",
    sme_certificate: "중소기업확인서",
    financial_statement: "재무제표",
    employment_insurance: "고용보험가입확인서",
    export_performance: "수출실적증명서",
    certification: "인증서",
    company_introduction: "회사소개서",
    business_plan: "기존 사업계획서",
    patent: "특허",
  }
  return typeNames[type] || type
}

// ============================================
// 응답 파싱
// ============================================

interface ParsedGenerationResponse {
  blocks: GeneratedBlock[]
  confidenceScore: number
}

/**
 * AI 응답에서 블록 데이터 추출
 */
function parseGenerationResponse(
  text: string,
  documents: DocumentAnalysisInput[]
): ParsedGenerationResponse | null {
  try {
    // ```json ... ``` 블록 추출
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : text

    const parsed = JSON.parse(jsonText.trim())

    if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
      logger.error("parseGenerationResponse: Missing blocks array")
      return null
    }

    // 문서 ID 매핑
    const docTypeToIds = new Map<string, string[]>()
    for (const doc of documents) {
      const existing = docTypeToIds.get(doc.documentType) || []
      existing.push(doc.documentId)
      docTypeToIds.set(doc.documentType, existing)
    }

    // 블록 정규화
    const blocks: GeneratedBlock[] = parsed.blocks.map((block: any, index: number) => {
      const sourceTypes = block.sourceDocumentTypes || []
      const sourceIds: string[] = []

      for (const type of sourceTypes) {
        const ids = docTypeToIds.get(type) || []
        sourceIds.push(...ids)
      }

      return {
        category: validateCategory(block.category),
        title: block.title || `블록 ${index + 1}`,
        blockOrder: block.blockOrder ?? index,
        content: block.content || "",
        contentType: block.contentType || "markdown",
        metadata: {
          keywords: block.keywords || [],
          confidenceScore: block.confidenceScore,
        } as ProfileBlockMetadata,
        sourceDocumentIds: sourceIds,
        sourceDocumentTypes: sourceTypes,
      }
    })

    // 같은 카테고리 내 blockOrder 재정렬
    const byCategory = new Map<string, GeneratedBlock[]>()
    for (const block of blocks) {
      const existing = byCategory.get(block.category) || []
      existing.push(block)
      byCategory.set(block.category, existing)
    }

    const reorderedBlocks: GeneratedBlock[] = []
    for (const [, categoryBlocks] of byCategory) {
      categoryBlocks.forEach((block, idx) => {
        block.blockOrder = idx
        reorderedBlocks.push(block)
      })
    }

    return {
      blocks: reorderedBlocks,
      confidenceScore: parsed.confidenceScore ?? 0.8,
    }
  } catch (error) {
    logger.error("parseGenerationResponse error", { error, rawText: text })
    return null
  }
}

/**
 * 카테고리 유효성 검증
 */
function validateCategory(category: string): ProfileBlockCategory {
  const validCategories = BLOCK_CATEGORIES.map((c) => c.id)
  if (validCategories.includes(category as ProfileBlockCategory)) {
    return category as ProfileBlockCategory
  }
  return "company_overview" // 기본값
}

// ============================================
// 개별 블록 재생성
// ============================================

/**
 * 특정 카테고리의 블록만 재생성
 */
export async function regenerateBlockForCategory(
  documents: DocumentAnalysisInput[],
  companyName: string,
  category: ProfileBlockCategory
): Promise<GeneratedBlock[]> {
  const categoryConfig = BLOCK_CATEGORIES.find((c) => c.id === category)
  if (!categoryConfig) {
    throw new Error(`Invalid category: ${category}`)
  }

  // 해당 카테고리 관련 문서만 필터링
  const relevantDocs =
    categoryConfig.sourceDocumentTypes[0] === "*"
      ? documents
      : documents.filter((d) =>
          categoryConfig.sourceDocumentTypes.includes(d.documentType)
        )

  if (relevantDocs.length === 0) {
    return []
  }

  const result = await generateProfileBlocks(relevantDocs, companyName)
  return result.blocks.filter((b) => b.category === category)
}
