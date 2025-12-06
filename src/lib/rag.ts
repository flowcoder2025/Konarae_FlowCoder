/**
 * RAG (Retrieval-Augmented Generation) System (PRD 12)
 * - Embedding generation with Vercel AI SDK
 * - Hybrid search (semantic + keyword)
 * - Document chunking and storage
 */

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "./prisma";

// Configuration (PRD 12.3)
const CHUNK_SIZE = 512; // tokens
const CHUNK_OVERLAP = 50; // tokens
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions

export type SourceType = "support_project" | "company" | "business_plan";

export interface ChunkMetadata {
  page_num?: number;
  section_title?: string;
  field_type?: string;
  [key: string]: any;
}

export interface HybridSearchParams {
  queryText: string;
  sourceType?: SourceType;
  matchThreshold?: number;
  matchCount?: number;
  semanticWeight?: number;
}

export interface SearchResult {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  content: string;
  chunkMetadata: ChunkMetadata;
  similarity: number;
  keywordScore: number;
  combinedScore: number;
}

/**
 * Generate embeddings for text using Vercel AI SDK (PRD 12.1)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL) as any,
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error("[RAG] Embedding generation error:", error);
    throw new Error("Failed to generate embedding");
  }
}

/**
 * Simple text chunking with token overlap (PRD 12.3)
 */
export function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  // Simplified tokenization by words
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Extract keywords from text for BM25 search
 */
export function extractKeywords(text: string): string[] {
  // Simple keyword extraction: lowercase, remove punctuation, filter common words
  const commonWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "이",
    "그",
    "저",
    "것",
    "등",
    "및",
    "와",
    "과",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !commonWords.has(word))
    .slice(0, 50); // Limit keywords
}

/**
 * Store document embeddings (PRD 12.4)
 */
export async function storeDocumentEmbeddings(
  sourceType: SourceType,
  sourceId: string,
  content: string,
  metadata: ChunkMetadata = {}
): Promise<void> {
  try {
    // Chunk the content
    const chunks = chunkText(content);

    // Generate embeddings for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);
      const keywords = extractKeywords(chunk);

      // Execute raw SQL to insert into document_embeddings table
      await prisma.$executeRaw`
        INSERT INTO document_embeddings (source_type, source_id, content, chunk_index, chunk_metadata, embedding, keywords)
        VALUES (${sourceType}, ${sourceId}, ${chunk}, ${i}, ${JSON.stringify(
        metadata
      )}::jsonb, ${JSON.stringify(embedding)}::vector, ${keywords})
        ON CONFLICT (source_type, source_id, chunk_index)
        DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          keywords = EXCLUDED.keywords,
          chunk_metadata = EXCLUDED.chunk_metadata,
          updated_at = NOW()
      `;
    }

    console.log(
      `[RAG] Stored ${chunks.length} embeddings for ${sourceType}:${sourceId}`
    );
  } catch (error) {
    console.error("[RAG] Store embeddings error:", error);
    throw new Error("Failed to store embeddings");
  }
}

/**
 * Hybrid search using pgvector + keyword matching (PRD 12.5)
 */
export async function hybridSearch(
  params: HybridSearchParams
): Promise<SearchResult[]> {
  const {
    queryText,
    sourceType,
    matchThreshold = 0.7,
    matchCount = 10,
    semanticWeight = 0.7,
  } = params;

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(queryText);
    const queryKeywords = extractKeywords(queryText);

    // Call hybrid_search SQL function
    const results: any[] = await prisma.$queryRaw`
      SELECT * FROM hybrid_search(
        ${JSON.stringify(queryEmbedding)}::vector,
        ${queryKeywords}::text[],
        ${sourceType || null}::varchar,
        ${matchThreshold}::float,
        ${matchCount}::int,
        ${semanticWeight}::float
      )
    `;

    return results.map((row) => ({
      id: row.id,
      sourceType: row.source_type as SourceType,
      sourceId: row.source_id,
      content: row.content,
      chunkMetadata: row.chunk_metadata,
      similarity: parseFloat(row.similarity),
      keywordScore: parseFloat(row.keyword_score),
      combinedScore: parseFloat(row.combined_score),
    }));
  } catch (error) {
    console.error("[RAG] Hybrid search error:", error);
    throw new Error("Failed to perform hybrid search");
  }
}

/**
 * Delete all embeddings for a source
 */
export async function deleteEmbeddings(
  sourceType: SourceType,
  sourceId: string
): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM document_embeddings
      WHERE source_type = ${sourceType} AND source_id = ${sourceId}
    `;

    console.log(`[RAG] Deleted embeddings for ${sourceType}:${sourceId}`);
  } catch (error) {
    console.error("[RAG] Delete embeddings error:", error);
    throw new Error("Failed to delete embeddings");
  }
}

/**
 * Get embedding count for a source
 */
export async function getEmbeddingCount(
  sourceType: SourceType,
  sourceId: string
): Promise<number> {
  try {
    const result: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM document_embeddings
      WHERE source_type = ${sourceType} AND source_id = ${sourceId}
    `;

    return result[0]?.count || 0;
  } catch (error) {
    console.error("[RAG] Get count error:", error);
    return 0;
  }
}
