-- Hybrid search function (PRD 12.5)
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

-- Comment
COMMENT ON FUNCTION hybrid_search IS 'Hybrid semantic + keyword search for RAG (PRD 12.5)';
