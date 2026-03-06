# FlowMate

**당신의 업무 흐름을 함께하는 AI 파트너**

정부 지원사업 매칭 및 사업계획서 자동화 플랫폼

## 📋 프로젝트 개요

중소기업과 스타트업이 적합한 지원사업을 찾고 AI 기반 사업계획서를 작성할 수 있도록 지원하는 플랫폼입니다.

### 핵심 기능

1. **지원사업 크롤링 & 정보 요약** - 정부기관 포털 자동 크롤링 및 AI 요약
2. **기업-지원사업 매칭** - 다차원 매칭 알고리즘 (semantic + rule-based)
3. **AI 사업계획서 초안 작성** - 지원사업별 맞춤형 사업계획서 생성
4. **사업계획서 평가 피드백** - 평가 기준에 따른 자동 평가 및 개선 제안

## 🛠 기술 스택

### Frontend
- **Framework**: Next.js 15 + React 19 + TypeScript
- **State**: TanStack Query 5.x
- **UI**: shadcn/ui + Radix UI + Tailwind CSS 4
- **Forms**: React Hook Form + Zod

### Backend (FDP Architecture)
- **Database**: Supabase PostgreSQL
- **ORM**: Prisma
- **Auth**: NextAuth.js v5
- **Permissions**: ReBAC (Relationship-Based Access Control)
- **Vector Search**: pgvector
- **Cache**: Upstash Redis

### External Services
- **AI**: Google Gemini 3 Pro Preview (`gemini-3-pro-preview`) + OpenAI Embeddings
- **Email**: Resend
- **Notifications**: Discord/Slack Webhooks
- **Storage**: Supabase Storage
- **Document Parsing**: OCI Worker (HWP/HWPX/PDF)
- **Cron Jobs**: Vercel Cron

## 🚀 시작하기

### 1. 환경 변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 필요한 값들을 채워주세요.

#### 필수 환경 변수

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# AI Models
GOOGLE_GENERATIVE_AI_API_KEY="..."
OPENAI_API_KEY="..."

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Notifications
RESEND_API_KEY="..."
DISCORD_WEBHOOK_URL="..." # (선택)
SLACK_WEBHOOK_URL="..."   # (선택)

# Cron (Production)
CRON_SECRET="..."         # Vercel Cron 인증

# Document Parsing
PARSER_MICROSERVICE_URL="..." # (선택)
```

### 2. 패키지 설치

```bash
pnpm install
```

### 3. 데이터베이스 설정

```bash
# Prisma 클라이언트 생성
pnpm db:generate

# 데이터베이스 마이그레이션
pnpm db:migrate

# (선택) Prisma Studio 실행
pnpm db:studio
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 📁 프로젝트 구조

```
flowmate/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes
│   │   ├── dashboard/         # Protected pages
│   │   ├── login/             # Auth pages
│   │   └── layout.tsx         # Root layout
│   ├── components/            # UI 컴포넌트
│   │   └── ui/                # shadcn/ui components
│   ├── features/              # 기능 모듈
│   ├── lib/                   # 유틸리티 & 백엔드 로직
│   │   ├── auth.ts            # NextAuth 설정
│   │   ├── prisma.ts          # Prisma 클라이언트
│   │   └── rebac.ts           # ReBAC 권한 시스템
│   └── types/                 # TypeScript 타입
├── prisma/
│   └── schema.prisma          # 데이터베이스 스키마
└── docs/                      # 프로젝트 문서
    ├── prd.md                 # Product Requirements Document
    └── architecture/          # 아키텍처 문서
```

## ⚡ 성능 최적화

### Redis 캐싱
- **API 응답 캐싱**: 자주 조회되는 데이터 캐싱 (TTL: 60s ~ 86400s)
- **매칭 결과 캐싱**: 계산 비용이 높은 매칭 결과 캐싱
- **Rate Limiting**: Sliding Window 알고리즘 (10 req/min per user)

### 캐시 키 전략
```typescript
// 프로젝트 목록
projects:list:{query_params_hash}

// 프로젝트 상세
projects:detail:{id}

// 기업 상세
companies:detail:{id}

// 매칭 결과
matching:result:{companyId}:{projectId}
```

### TTL 설정
- **short**: 60초 (실시간성 필요)
- **medium**: 300초 (일반 API)
- **long**: 1800초 (자주 변경되지 않는 데이터)
- **day**: 86400초 (정적 데이터)

## 🔐 권한 시스템 (ReBAC)

### Namespace Definitions

```typescript
const permissions = {
  company: {
    owner: ['admin', 'member', 'viewer'],  // inherits all
    admin: ['member', 'viewer'],
    member: ['viewer'],
    viewer: []
  },
  business_plan: {
    owner: ['editor', 'viewer'],
    editor: ['viewer'],
    viewer: []
  }
}
```

### 사용 예시

```typescript
import { check, grant, revoke } from '@/lib/rebac';

// 권한 확인
const canEdit = await check(userId, 'business_plan', planId, 'editor');

// 권한 부여
await grant('business_plan', planId, 'viewer', 'user', collaboratorId);

// 권한 취소
await revoke('business_plan', planId, 'viewer', 'user', collaboratorId);
```

## 📚 주요 명령어

```bash
# 개발
pnpm dev              # 개발 서버 실행
pnpm build            # 프로덕션 빌드
pnpm start            # 프로덕션 서버 실행
pnpm lint             # ESLint 실행

# 데이터베이스
pnpm db:generate      # Prisma 클라이언트 생성
pnpm db:push          # 스키마 푸시 (개발용)
pnpm db:migrate       # 마이그레이션 실행
pnpm db:studio        # Prisma Studio 실행
pnpm db:seed          # 시드 데이터 삽입

# 테스트
pnpm test             # Jest 테스트 실행
pnpm test:watch       # Watch 모드로 테스트
```

## 🌟 개발 단계

### Phase 1: Infrastructure Setup ✅
- [x] Next.js 15 프로젝트 초기화
- [x] Prisma 스키마 정의
- [x] NextAuth.js 설정
- [x] ReBAC 권한 시스템 구현
- [x] 기본 UI 레이아웃

### Phase 2: Company Management ✅
- [x] 기업 CRUD 기능
- [x] 멤버 초대/관리
- [x] 재무/인증 정보 관리
- [x] 기업 전환 기능

### Phase 3: Support Project Crawling ✅
- [x] 정부지원사업 크롤링 시스템
- [x] AI 요약 및 분류
- [x] 검색 및 필터링

### Phase 4: Matching System ✅
- [x] Semantic Search (pgvector + OpenAI embeddings)
- [x] Rule-based Filtering
- [x] Matching Score 계산
- [x] 매칭 결과 저장 및 관리

### Phase 5: Business Plan Generator ✅
- [x] AI 사업계획서 자동 생성 (Gemini 3 Pro Preview)
- [x] RAG 기반 컨텍스트 빌딩
- [x] 버전 관리 및 초안 저장
- [x] 협업 기능

### Phase 6: Evaluation System ✅
- [x] AI 기반 사업계획서 평가
- [x] 평가 기준별 점수 및 피드백
- [x] 외부 파일 업로드 평가
- [x] 비동기 처리 및 상태 관리

### Phase 7: Notifications ✅
- [x] Discord/Slack/Email 알림
- [x] 사용자별 알림 설정
- [x] 마감일 자동 알림 (Vercel Cron)
- [x] 평가/매칭 완료 알림

### Phase 8: Performance Optimization ✅
- [x] Redis 캐싱 (API 응답, 매칭 결과)
- [x] Rate Limiting (Sliding Window)
- [x] 성능 모니터링 유틸리티
- [x] 기본 테스트 커버리지

자세한 내용은 `/docs/prd.md` 참조

## 🖥 Worker 인프라 (OCI)

워커 서비스는 OCI Always Free VM에서 Docker 컨테이너로 운영됩니다.

| 서비스 | 포트 | 역할 |
|--------|------|------|
| flowmate-crawler | 3001 | 지원사업 크롤링 |
| flowmate-embedding | 3002 | 임베딩 생성 + RAG 매칭 |
| flowmate-parser | 8000 | HWP/HWPX/PDF 텍스트 추출 |

- **서버**: Ampere A1.Flex (4 OCPU, 24GB RAM, ARM64)
- **도메인**: `worker.jerome87.com` (Cloudflare Proxy)
- **배포**: `deploy/oci/deploy.sh` (build / start / stop / status / logs)

```bash
# OCI 서버에서 배포
cd /home/ubuntu/flowmate
./deploy/oci/deploy.sh build    # Docker 이미지 빌드
./deploy/oci/deploy.sh start    # 컨테이너 시작
./deploy/oci/deploy.sh status   # 헬스 체크
./deploy/oci/deploy.sh logs parser  # 로그 확인
```

## 📖 문서

- [PRD (Product Requirements Document)](/docs/prd.md)
- [Claude.md (개발 가이드)](/claude.md)
- [Architecture Docs](/docs/architecture/)

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

이 프로젝트는 비공개 프로젝트입니다.

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 등록해주세요.
