-- CreateTable: CompanyDocument
-- 기업 문서 관리 (PDF/이미지만 허용)
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    -- 문서 유형 (10가지)
    "documentType" TEXT NOT NULL,
    -- business_registration, corporation_registry, sme_certificate,
    -- financial_statement, employment_insurance, export_performance,
    -- certification, company_introduction, business_plan, patent

    -- 파일 정보
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,

    -- 메타데이터
    "uploadedBy" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    -- 상태
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    -- uploaded, analyzing, analyzed, failed
    "errorMessage" TEXT,

    -- 타임스탬프
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanyDocumentAnalysis
-- AI 분석 결과 저장
CREATE TABLE "CompanyDocumentAnalysis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    -- AI 분석 결과
    "extractedData" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "keyInsights" TEXT[],

    -- 신뢰도
    "confidenceScore" DOUBLE PRECISION,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanyDocumentEmbedding
-- 벡터 임베딩 저장
CREATE TABLE "CompanyDocumentEmbedding" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDocumentEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_documentType_idx" ON "CompanyDocument"("companyId", "documentType");
CREATE INDEX "CompanyDocument_status_idx" ON "CompanyDocument"("status");
CREATE INDEX "CompanyDocument_uploadedBy_idx" ON "CompanyDocument"("uploadedBy");

CREATE UNIQUE INDEX "CompanyDocumentAnalysis_documentId_key" ON "CompanyDocumentAnalysis"("documentId");

CREATE UNIQUE INDEX "CompanyDocumentEmbedding_documentId_chunkIndex_key" ON "CompanyDocumentEmbedding"("documentId", "chunkIndex");
CREATE INDEX "CompanyDocumentEmbedding_documentId_idx" ON "CompanyDocumentEmbedding"("documentId");

-- CreateIndex: HNSW for vector similarity search
CREATE INDEX "CompanyDocumentEmbedding_embedding_idx" ON "CompanyDocumentEmbedding"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyDocumentAnalysis" ADD CONSTRAINT "CompanyDocumentAnalysis_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyDocumentEmbedding" ADD CONSTRAINT "CompanyDocumentEmbedding_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
