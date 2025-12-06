-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main embeddings table (PRD 12.4)
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

-- HNSW Index for fast similarity search (cosine) (PRD 12.4)
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
COMMENT ON TABLE document_embeddings IS 'RAG vector embeddings for support projects, companies, and business plans (PRD 12.4)';
