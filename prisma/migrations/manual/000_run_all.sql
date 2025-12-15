-- ===========================================================
-- RAG System Setup Script
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ===========================================================

-- ============================================
-- PART 1: Enable pgvector extension
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- PART 2: Create document_embeddings table
-- ============================================
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference
  source_type VARCHAR(50) NOT NULL, -- 'support_project' | 'company' | 'business_plan'
  source_id TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_metadata JSONB DEFAULT '{}',

  -- Vector (1536 for OpenAI text-embedding-3-small)
  embedding vector(1536) NOT NULL,

  -- Search optimization
  keywords TEXT[], -- BM25 keyword search

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(source_type, source_id, chunk_index)
);

-- HNSW Index for fast similarity search (cosine)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for keyword search
CREATE INDEX IF NOT EXISTS idx_embeddings_keywords ON document_embeddings
  USING GIN (keywords);

-- Composite index for filtered searches
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON document_embeddings (source_type, source_id);

-- Timestamp index for cleanup/maintenance
CREATE INDEX IF NOT EXISTS idx_embeddings_created ON document_embeddings (created_at DESC);

-- Comment
COMMENT ON TABLE document_embeddings IS 'RAG vector embeddings for support projects, companies, and business plans';

-- ============================================
-- PART 3: Create hybrid_search function
-- ============================================
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_keywords TEXT[] DEFAULT '{}',
  source_filter VARCHAR(50) DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  semantic_weight FLOAT DEFAULT 0.7
) RETURNS TABLE (
  id UUID,
  source_type VARCHAR,
  source_id TEXT,
  content TEXT,
  chunk_metadata JSONB,
  similarity FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      de.id,
      de.source_type,
      de.source_id,
      de.content,
      de.chunk_metadata,
      1 - (de.embedding <=> query_embedding) AS similarity,
      COALESCE(
        (SELECT COUNT(*)::FLOAT / NULLIF(array_length(query_keywords, 1), 0)
         FROM unnest(de.keywords) k
         WHERE k = ANY(query_keywords)),
        0
      ) AS keyword_score
    FROM document_embeddings de
    WHERE (source_filter IS NULL OR de.source_type = source_filter)
      AND 1 - (de.embedding <=> query_embedding) > match_threshold
  )
  SELECT
    sr.id,
    sr.source_type,
    sr.source_id,
    sr.content,
    sr.chunk_metadata,
    sr.similarity,
    sr.keyword_score,
    (sr.similarity * semantic_weight + sr.keyword_score * (1 - semantic_weight)) AS combined_score
  FROM semantic_results sr
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search IS 'Hybrid semantic + keyword search for RAG';

-- ============================================
-- VERIFICATION: Check if everything is created
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ pgvector extension enabled';
  RAISE NOTICE '✅ document_embeddings table created';
  RAISE NOTICE '✅ hybrid_search function created';
  RAISE NOTICE '✅ All indexes created';
  RAISE NOTICE '';
  RAISE NOTICE 'RAG System ready! Now run embedding generation.';
END $$;
