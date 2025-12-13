-- Add needsEmbedding flag to SupportProject
-- This flag indicates that a project needs embedding generation
-- Set to true on create/update, set to false after embeddings are generated

ALTER TABLE "SupportProject"
ADD COLUMN IF NOT EXISTS "needsEmbedding" BOOLEAN NOT NULL DEFAULT true;

-- Set existing projects to need embeddings
UPDATE "SupportProject"
SET "needsEmbedding" = true
WHERE "deletedAt" IS NULL;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS "SupportProject_needsEmbedding_idx"
ON "SupportProject"("needsEmbedding")
WHERE "needsEmbedding" = true AND "deletedAt" IS NULL;

-- Comment
COMMENT ON COLUMN "SupportProject"."needsEmbedding" IS 'Flag for async embedding generation queue';
