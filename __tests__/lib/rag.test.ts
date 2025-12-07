/**
 * RAG (Retrieval-Augmented Generation) Unit Tests
 * Testing pure functions (chunking, keyword extraction)
 * NOTE: Integration tests with AI/DB are in __tests__/integration/
 */

import { describe, it, expect } from "@jest/globals";
import { chunkText, extractKeywords } from "@/lib/rag";

describe("RAG - Text Chunking", () => {
  it("should split text into chunks with overlap", () => {
    const text = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10";
    const chunks = chunkText(text, 3, 1); // chunk size 3 words, overlap 1 word

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("word1");
  });

  it("should handle empty text", () => {
    const chunks = chunkText("");
    expect(chunks).toEqual([]);
  });

  it("should handle single word", () => {
    const chunks = chunkText("word");
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("word");
  });
});

describe("RAG - Keyword Extraction", () => {
  it("should extract meaningful keywords from text", () => {
    const text = "정부 지원사업 R&D 기술개발 중소기업 스타트업";
    const keywords = extractKeywords(text);

    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("should handle empty text", () => {
    const keywords = extractKeywords("");
    expect(keywords).toEqual([]);
  });

  it("should convert to lowercase and filter common words", () => {
    const text = "The quick brown fox";
    const keywords = extractKeywords(text);

    // Should not include common words like 'the'
    expect(keywords).not.toContain("the");
  });
});
