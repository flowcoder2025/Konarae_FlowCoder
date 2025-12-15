# Prisma 가이드

> **역할**: 데이터베이스 스키마, 마이그레이션, pgvector 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/src/lib/claude.md`, `/src/types/claude.md`

---

## 1. 디렉토리 구조

```
/prisma
├── claude.md                    # [현재 파일]
├── schema.prisma                # Prisma 스키마 (SSOT)
└── /migrations
    ├── /manual                  # 수동 SQL 마이그레이션
    │   └── 000_run_all.sql      # pgvector, document_embeddings 등
    └── /20251213_*              # 자동 마이그레이션
```

---

## 2. 스키마 구조

### 2.1 핵심 모델 그룹

```
┌─────────────────────────────────────────────────────────────┐
│                    NextAuth Core (3개)                       │
├─────────────────────────────────────────────────────────────┤
│  User ─── Account ─── Session ─── VerificationToken        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ReBAC System (2개)                        │
├─────────────────────────────────────────────────────────────┤
│  RelationTuple ─── RelationDefinition                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Domain Models                             │
├─────────────────────────────────────────────────────────────┤
│  Company ─┬─ CompanyMember                                  │
│           ├─ CompanyFinancial                               │
│           ├─ CompanyCertification                           │
│           ├─ CompanyAchievement                             │
│           └─ CompanyDocument ─┬─ CompanyDocumentAnalysis    │
│                               └─ CompanyDocumentEmbedding   │
│                                                              │
│  SupportProject ─┬─ ProjectAttachment                       │
│                  └─ (needsEmbedding 플래그)                  │
│                                                              │
│  BusinessPlan ─── BusinessPlanSection ─── Evaluation        │
│                                                              │
│  MatchingResult ─── MatchingPreference                      │
│                                                              │
│  Notification ─── NotificationSetting                       │
│                                                              │
│  CrawlSource ─── CrawlJob                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 주요 모델 설명

| 모델 | 용도 | 핵심 필드 |
|-----|------|----------|
| `User` | 사용자 | email, role(user/admin) |
| `Company` | 기업 | businessNumber, 인증 플래그들 |
| `SupportProject` | 지원사업 | needsEmbedding, status |
| `CompanyDocument` | 기업 문서 | documentType (10종), status |
| `MatchingResult` | 매칭 결과 | scores, confidence |
| `RelationTuple` | ReBAC 권한 | namespace, relation, subject |

---

## 3. pgvector 설정

### 3.1 확장 활성화

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  extensions = [pgvector(map: "vector")]
}
```

### 3.2 벡터 컬럼

```prisma
model CompanyDocumentEmbedding {
  id         String                      @id @default(cuid())
  embedding  Unsupported("vector(1536)") // OpenAI text-embedding-3-small
  // ...
}
```

### 3.3 벡터 인덱스 (수동 SQL)

```sql
-- /migrations/manual/000_run_all.sql
CREATE INDEX IF NOT EXISTS idx_company_doc_embedding_hnsw
ON "CompanyDocumentEmbedding"
USING hnsw (embedding vector_cosine_ops);
```

---

## 4. 마이그레이션 패턴

### 4.1 자동 마이그레이션

```bash
# 개발 환경
npx prisma migrate dev --name add_new_field

# 프로덕션
npx prisma migrate deploy
```

### 4.2 수동 마이그레이션

pgvector, 복잡한 인덱스 등은 `/migrations/manual/` 사용:

```sql
-- 000_run_all.sql
-- pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- document_embeddings 통합 테이블
CREATE TABLE IF NOT EXISTS document_embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 인덱스
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_hnsw
ON document_embeddings
USING hnsw (embedding vector_cosine_ops);
```

### 4.3 수동 SQL 실행

```bash
# Supabase SQL Editor 또는
psql $DATABASE_URL -f prisma/migrations/manual/000_run_all.sql
```

---

## 5. 관계 패턴

### 5.1 1:N 관계

```prisma
model Company {
  id      String          @id @default(cuid())
  members CompanyMember[]
}

model CompanyMember {
  id        String  @id @default(cuid())
  companyId String
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}
```

### 5.2 1:1 관계

```prisma
model CompanyDocument {
  id       String                   @id @default(cuid())
  analysis CompanyDocumentAnalysis?
}

model CompanyDocumentAnalysis {
  id         String @id @default(cuid())
  documentId String @unique
  document   CompanyDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
}
```

---

## 6. 인덱스 전략

### 6.1 필수 인덱스

```prisma
@@index([companyId])           // FK 인덱스
@@index([status])              // 상태 필터링
@@index([createdAt(sort: Desc)]) // 정렬
@@unique([companyId, userId])  // 복합 유니크
```

### 6.2 인덱스 가이드

| 패턴 | 사용 시점 |
|-----|----------|
| `@unique` | 비즈니스 키 (businessNumber 등) |
| `@@unique` | 복합 유니크 제약 |
| `@@index` | 자주 조회되는 FK, 필터 컬럼 |
| HNSW | 벡터 유사도 검색 |

---

## 7. 비동기 임베딩 플래그

```prisma
model SupportProject {
  // ...
  needsEmbedding Boolean @default(true)
}
```

**워크플로우**:
1. 크롤러: `needsEmbedding = true` 설정
2. Cron: `needsEmbedding = true` 프로젝트 조회
3. Railway Worker: 임베딩 생성 후 `needsEmbedding = false`

---

## 8. 문서 유형 (CompanyDocument)

```
business_registration    # 사업자등록증
corporation_registry     # 법인등기부등본
sme_certificate          # 중소기업확인서
financial_statement      # 재무제표
employment_insurance     # 고용보험가입확인서
export_performance       # 수출실적
certification            # 인증서
company_introduction     # 회사소개서
business_plan            # 사업계획서
patent                   # 특허
```

---

## 9. Prisma 클라이언트

### 9.1 싱글톤 패턴

```tsx
// /src/lib/prisma.ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

### 9.2 타입 활용

```tsx
import { Company, User, Prisma } from "@prisma/client"

// Prisma 생성 타입 사용
type CompanyWithMembers = Prisma.CompanyGetPayload<{
  include: { members: true }
}>
```

---

## 10. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙

### 연관
- `/src/lib/claude.md` → Prisma 클라이언트, 쿼리 패턴
- `/src/types/claude.md` → Prisma 타입 활용
- `/src/app/claude.md` → API에서 Prisma 사용

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-15 | 초기 생성 |
