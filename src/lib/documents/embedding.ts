/**
 * 벡터 임베딩 생성 및 저장
 * OpenAI text-embedding-3-small 사용
 */

import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "documents-embedding" });

// cuid 생성 함수 (임베딩 ID용)
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  return `c${timestamp}${randomStr}`;
}

// ============================================
// 청킹 설정
// ============================================

const CHUNK_SIZE = 512; // 토큰 단위
const CHUNK_OVERLAP = 50; // 오버랩 토큰

// ============================================
// 텍스트 청킹
// ============================================

export interface TextChunk {
  content: string;
  index: number;
  metadata: Record<string, any>;
}

/**
 * 긴 텍스트를 청크로 분할
 * 간단한 문자 기반 청킹 (향후 토큰 기반으로 개선 가능)
 */
export function chunkText(
  text: string,
  metadata: Record<string, any> = {}
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 단순 문자 길이 기준 (대략 512토큰 ≈ 2048자)
  const chunkCharSize = CHUNK_SIZE * 4;
  const overlapCharSize = CHUNK_OVERLAP * 4;

  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkCharSize, text.length);
    const chunkContent = text.slice(start, end).trim();

    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        index,
        metadata: {
          ...metadata,
          chunkIndex: index,
          startPos: start,
          endPos: end,
        },
      });
      index++;
    }

    start += chunkCharSize - overlapCharSize;
  }

  return chunks;
}

// ============================================
// 임베딩 생성
// ============================================

export interface EmbeddingResult {
  success: boolean;
  embeddings?: Array<{
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
  }>;
  error?: string;
}

/**
 * 텍스트 청크들의 임베딩 생성
 */
export async function generateEmbeddings(
  chunks: TextChunk[]
): Promise<EmbeddingResult> {
  try {
    const model = openai.textEmbeddingModel("text-embedding-3-small");

    // 배치 임베딩 생성
    const texts = chunks.map((chunk) => chunk.content);

    const { embeddings } = await embedMany({
      model,
      values: texts,
    });

    const results = chunks.map((chunk, i) => ({
      content: chunk.content,
      embedding: embeddings[i],
      metadata: chunk.metadata,
    }));

    return {
      success: true,
      embeddings: results,
    };
  } catch (error) {
    logger.error("generateEmbeddings error", { error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "임베딩 생성 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 단일 텍스트의 임베딩 생성
 */
export async function generateSingleEmbedding(
  text: string
): Promise<number[] | null> {
  try {
    const model = openai.textEmbeddingModel("text-embedding-3-small");

    const { embedding } = await embed({
      model,
      value: text,
    });

    return embedding;
  } catch (error) {
    logger.error("generateSingleEmbedding error", { error });
    return null;
  }
}

// ============================================
// DB 저장
// ============================================

/**
 * 문서의 임베딩을 DB에 저장
 */
export async function saveDocumentEmbeddings(
  documentId: string,
  embeddings: Array<{
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // 기존 임베딩 삭제 (재분석 시)
    await prisma.$executeRaw`
      DELETE FROM "CompanyDocumentEmbedding"
      WHERE "documentId" = ${documentId}
    `;

    // 새 임베딩 저장 (Raw SQL 사용 - Unsupported vector 타입)
    for (let i = 0; i < embeddings.length; i++) {
      const emb = embeddings[i];
      const vectorStr = `[${emb.embedding.join(",")}]`;

      await prisma.$executeRaw`
        INSERT INTO "CompanyDocumentEmbedding" (
          "id", "documentId", "chunkIndex", "content", "embedding", "metadata", "createdAt"
        ) VALUES (
          ${generateCuid()},
          ${documentId},
          ${i},
          ${emb.content},
          ${vectorStr}::vector,
          ${JSON.stringify(emb.metadata)}::jsonb,
          NOW()
        )
      `;
    }

    return { success: true };
  } catch (error) {
    logger.error("saveDocumentEmbeddings error", { error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "임베딩 저장 중 오류가 발생했습니다.",
    };
  }
}

// ============================================
// 전체 파이프라인
// ============================================

/**
 * 텍스트 → 청킹 → 임베딩 생성 → DB 저장
 */
export async function processDocumentEmbeddings(
  documentId: string,
  text: string,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  // 1. 청킹
  const chunks = chunkText(text, metadata);

  if (chunks.length === 0) {
    return {
      success: false,
      error: "텍스트가 비어 있습니다.",
    };
  }

  // 2. 임베딩 생성
  const embeddingResult = await generateEmbeddings(chunks);

  if (!embeddingResult.success || !embeddingResult.embeddings) {
    return {
      success: false,
      error: embeddingResult.error || "임베딩 생성 실패",
    };
  }

  // 3. DB 저장
  const saveResult = await saveDocumentEmbeddings(
    documentId,
    embeddingResult.embeddings
  );

  return saveResult;
}

// ============================================
// 벡터 검색 (향후 매칭 시 사용)
// ============================================

/**
 * 유사도 검색
 * @param queryEmbedding 쿼리 벡터
 * @param companyId 기업 ID (필터링)
 * @param limit 결과 개수
 */
export async function searchSimilarDocuments(
  queryEmbedding: number[],
  companyId?: string,
  limit: number = 10
): Promise<
  Array<{
    documentId: string;
    content: string;
    similarity: number;
    metadata: any;
  }>
> {
  try {
    // pgvector 코사인 유사도 검색 - 파라미터화된 쿼리 사용
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // companyId 유무에 따라 별도 쿼리 실행 (SQL Injection 방지)
    const results = companyId
      ? await prisma.$queryRaw<any[]>`
          SELECT
            de."documentId",
            de.content,
            de.metadata,
            1 - (de.embedding <=> ${embeddingStr}::vector) as similarity
          FROM "CompanyDocumentEmbedding" de
          INNER JOIN "CompanyDocument" cd ON cd.id = de."documentId"
          WHERE cd."deletedAt" IS NULL
            AND cd."companyId" = ${companyId}
          ORDER BY de.embedding <=> ${embeddingStr}::vector
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<any[]>`
          SELECT
            de."documentId",
            de.content,
            de.metadata,
            1 - (de.embedding <=> ${embeddingStr}::vector) as similarity
          FROM "CompanyDocumentEmbedding" de
          INNER JOIN "CompanyDocument" cd ON cd.id = de."documentId"
          WHERE cd."deletedAt" IS NULL
          ORDER BY de.embedding <=> ${embeddingStr}::vector
          LIMIT ${limit}
        `;

    return results.map((r) => ({
      documentId: r.documentId,
      content: r.content,
      similarity: parseFloat(r.similarity),
      metadata: r.metadata,
    }));
  } catch (error) {
    logger.error("searchSimilarDocuments error", { error });
    return [];
  }
}
