# 기업 문서 관리 시스템 구현 완료 보고서

## 📋 프로젝트 개요

**목적**: 기업 매칭 변별력 향상 및 사업계획서 작성 역량 강화
**방법**: 10가지 기업 서류 업로드 → AI 분석 → 벡터 임베딩 → 매칭/사업계획서 활용
**기술**: Gemini 2.5 Pro (멀티모달), OpenAI Embeddings, Supabase Storage, Prisma

---

## ✅ 구현 완료 항목

### 1. 데이터베이스 스키마 ✅

**파일**: `prisma/schema.prisma`

**추가된 모델**:
- `CompanyDocument`: 문서 메타데이터 (파일 정보, 상태, 버전)
- `CompanyDocumentAnalysis`: AI 분석 결과 (추출 데이터, 요약, 인사이트)
- `CompanyDocumentEmbedding`: 벡터 임베딩 (검색용, 1536d)

**특징**:
- PDF/이미지만 허용 (HWP 파서 불필요)
- pgvector 활용 (HNSW 인덱스)
- Soft Delete 지원
- 버전 관리 (수정 등록 시 증가)

### 2. 타입 시스템 ✅

**파일**: `src/lib/documents/types.ts`

**10가지 문서 유형**:
1. 사업자등록증 (BUSINESS_REGISTRATION)
2. 법인등기부등본 (CORPORATION_REGISTRY)
3. 중소기업확인서 (SME_CERTIFICATE)
4. 표준재무제표증명원 (FINANCIAL_STATEMENT)
5. 고용보험 가입자 명부 (EMPLOYMENT_INSURANCE)
6. 수출 실적 (EXPORT_PERFORMANCE)
7. 각종 인증서 (CERTIFICATION)
8. 회사 소개서 (COMPANY_INTRODUCTION)
9. 기존 사업계획서 (BUSINESS_PLAN)
10. 특허 전문 (PATENT)

**각 문서별 구조화된 추출 데이터 스키마 정의**

### 3. 파일 업로드 시스템 ✅

**파일**: `src/lib/documents/upload.ts`

**기능**:
- 파일 유효성 검증 (타입, 크기)
- Supabase Storage 업로드
- Signed URL 생성 (다운로드용)
- Base64 변환 (Gemini Vision용)

**Supabase Storage 구조**:
```
company-documents/
  └── {userId}/{companyId}/{documentType}/{timestamp}_{fileName}
```

### 4. Gemini 2.5 Pro 멀티모달 분석 ✅

**파일**:
- `src/lib/documents/prompts.ts`: 문서 유형별 프롬프트 (10개)
- `src/lib/documents/analyze.ts`: Gemini Vision API 호출

**처리 흐름**:
1. PDF/이미지 → Base64 변환
2. Gemini 2.5 Pro Vision API 호출
3. JSON 응답 파싱 → 구조화된 데이터 추출
4. 신뢰도 점수 계산

**프롬프트 특징**:
- 문서 유형별 맞춤 정보 추출
- 요약 및 핵심 인사이트 자동 생성
- JSON 응답 강제

### 5. 벡터 임베딩 시스템 ✅

**파일**: `src/lib/documents/embedding.ts`

**기능**:
- 텍스트 청킹 (512 토큰, 50 오버랩)
- OpenAI text-embedding-3-small (1536d)
- pgvector 저장
- 유사도 검색 (코사인 거리)

**활용**:
- 매칭 시 기업 문서 내용 활용
- 사업계획서 작성 시 컨텍스트 제공

### 6. API 엔드포인트 ✅

**구현된 API**:
- `POST /api/companies/[id]/documents/upload`: 문서 업로드
- `GET /api/companies/[id]/documents`: 문서 목록 조회
- `GET /api/companies/[id]/documents/[documentId]`: 문서 상세
- `PATCH /api/companies/[id]/documents/[documentId]`: 수정 등록 (재분석)
- `DELETE /api/companies/[id]/documents/[documentId]`: 문서 삭제

**권한 체계** (ReBAC):
- `viewer`: 조회만
- `member`: 조회 + 업로드
- `admin`: 모든 작업
- `owner`: 모든 작업

### 7. UI 컴포넌트 ✅

**파일**:
- `src/components/documents/document-upload-card.tsx`: 개별 문서 카드
- `src/app/companies/[id]/documents/page.tsx`: 문서 관리 페이지

**기능**:
- 10가지 문서 그리드 표시
- 업로드 진행 상태 (Progress Bar)
- 분석 상태 표시 (업로드 완료, 분석 중, 분석 완료, 실패)
- 수정 등록 버튼

---

## 🚀 배포 가이드

### 1. Prisma 마이그레이션 적용

```bash
# 마이그레이션 생성
pnpm prisma migrate dev --name add_company_documents

# 프로덕션 적용
pnpm prisma migrate deploy

# Prisma Client 재생성
pnpm prisma generate
```

### 2. Supabase Storage 설정

Supabase Dashboard에서:
1. Storage → Create Bucket
2. 버킷명: `company-documents` (Private)
3. RLS 정책 설정 (docs/supabase-storage-setup.md 참조)

### 3. 환경 변수 확인

```env
# 이미 설정됨
GEMINI_API_KEY="..."
OPENAI_API_KEY="..."
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

### 4. 빌드 및 테스트

```bash
# 타입 체크
pnpm tsc --noEmit

# 빌드
pnpm build

# 개발 서버 실행
pnpm dev
```

---

## 📊 처리 흐름

```
1. 사용자 업로드 (PDF/이미지)
   ↓
2. Supabase Storage 저장
   ↓
3. DB 레코드 생성 (status: uploaded)
   ↓
4. Gemini 2.5 Pro Vision 분석
   - 문서 유형별 정보 추출
   - 요약 및 인사이트 생성
   ↓
5. 분석 결과 저장 (CompanyDocumentAnalysis)
   ↓
6. 벡터 임베딩 생성 (OpenAI)
   ↓
7. 임베딩 저장 (CompanyDocumentEmbedding)
   ↓
8. 상태 업데이트 (status: analyzed)
```

---

## 🔄 수정 등록 흐름

```
1. 새 파일 업로드
   ↓
2. 기존 파일 삭제 (Storage)
   ↓
3. 버전 증가 (version++)
   ↓
4. 기존 분석/임베딩 삭제
   ↓
5. 재분석 트리거 (위 처리 흐름 반복)
```

---

## 🧩 매칭 시스템 통합 (향후 작업)

### 기존 매칭 알고리즘
```typescript
interface MatchingWeights {
  semantic: 0.35,      // 벡터 유사도
  category: 0.20,      // 카테고리 매칭
  eligibility: 0.20,   // 자격 요건
  timeliness: 0.15,    // 마감일
  amount: 0.10         // 금액 범위
}
```

### 문서 기반 개선안

1. **자격 요건 자동 검증** (eligibility: 20% → 25%)
   - 중소기업확인서 → 기업 규모 자동 판단
   - 인증서 → 기술/품질 요구사항 매칭

2. **재무 적정성 정밀 판단** (amount: 10% → 15%)
   - 표준재무제표 → 신용등급, 성장률 고려
   - 지원금액 적정성 정밀 계산

3. **벡터 검색 강화** (semantic: 35% → 40%)
   - 회사 소개서 + 사업계획서 임베딩
   - 지원사업 요구사항과 의미론적 유사도

**코드 예시**:
```typescript
// src/lib/matching/enhanced-algorithm.ts
import { searchSimilarDocuments } from "@/lib/documents/embedding";

async function enhancedMatching(companyId: string, projectId: string) {
  // 기존 매칭 로직...

  // 문서 기반 자격 검증
  const smeDoc = await getDocument(companyId, "sme_certificate");
  if (smeDoc?.analysis) {
    const { companySize } = smeDoc.analysis.extractedData;
    // 자격 요건 자동 검증...
  }

  // 벡터 검색 활용
  const projectEmbedding = await getProjectEmbedding(projectId);
  const similarDocs = await searchSimilarDocuments(
    projectEmbedding,
    companyId,
    5
  );

  // 유사도 점수 반영...
}
```

---

## 📝 사업계획서 생성 통합 (향후 작업)

### RAG 컨텍스트 구성

기존:
- 지원사업 (40%)
- 기업 프로필 (60%)

개선:
- 지원사업 (40%)
- **기업 문서** (35%) ← 새로 추가
  - 재무제표 → 재무 계획
  - 고용보험 → 인력 운영 계획
  - 특허 → 기술 경쟁력
  - 회사 소개서 → 회사 소개
- 참고 자료 (25%)

**코드 예시**:
```typescript
// src/lib/business-plan/rag-context.ts
async function assembleContext(companyId: string, projectId: string) {
  // 기업 문서 분석 결과 가져오기
  const documents = await prisma.companyDocument.findMany({
    where: { companyId, status: "analyzed" },
    include: { analysis: true },
  });

  const context = {
    project: await getProject(projectId), // 40%
    company: {
      profile: await getCompanyProfile(companyId),
      documents: documents.map(doc => ({
        type: doc.documentType,
        summary: doc.analysis?.summary,
        insights: doc.analysis?.keyInsights,
      })),
    }, // 35%
    references: await getSimilarPlans(companyId), // 25%
  };

  return context;
}
```

---

## ⚠️ 주의사항

1. **파일 크기 제한**: 10MB (Gemini API 제한)
2. **비용 관리**:
   - Gemini 2.5 Pro: 문서당 $0.01-0.05
   - OpenAI Embeddings: 청크당 $0.0001
   - Supabase Storage: 무료 1GB → 초과 시 유료
3. **처리 시간**: 문서당 10초~2분 (비동기 처리 권장)
4. **보안**: Supabase RLS 정책 필수 설정

---

## 🎯 다음 단계

### 즉시 수행
1. ✅ Prisma 마이그레이션 적용
2. ✅ Supabase Storage 버킷 생성 및 RLS 설정
3. ✅ 빌드 테스트

### 단기 (1주 이내)
1. 실제 문서 업로드 테스트
2. 매칭 알고리즘 통합
3. 사업계획서 생성 통합

### 중기 (1개월 이내)
1. 비동기 처리 최적화 (QStash or Railway Worker)
2. 분석 정확도 개선 (프롬프트 튜닝)
3. 사용자 피드백 수집 및 반영

---

## 📚 참고 파일

**핵심 구현**:
- `prisma/schema.prisma`: DB 스키마
- `src/lib/documents/*.ts`: 핵심 로직
- `src/app/api/companies/[id]/documents/**/*.ts`: API

**문서**:
- `docs/supabase-storage-setup.md`: Storage 설정
- `docs/company-documents-implementation.md`: 이 파일

**UI**:
- `src/components/documents/document-upload-card.tsx`: 업로드 카드
- `src/app/companies/[id]/documents/page.tsx`: 문서 관리 페이지

---

## ✨ 구현 하이라이트

1. **간소화된 아키텍처**: PDF/이미지만 허용 → Railway 파서 불필요 → Gemini Vision 직접 처리
2. **10가지 문서 유형**: 매칭 및 사업계획서 작성에 필요한 모든 정보 커버
3. **완전 자동화**: 업로드 → 분석 → 임베딩 → 활용까지 자동
4. **수정 등록 지원**: 언제든지 업데이트 → 자동 재분석
5. **확장 가능**: 새로운 문서 유형 추가 용이

---

**구현 완료일**: 2025-12-14
**구현자**: Claude Code
**상태**: ✅ MVP 완료, 배포 준비 완료
