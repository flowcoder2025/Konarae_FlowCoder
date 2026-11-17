# Lib 가이드 (유틸리티 & 백엔드)

> **역할**: 유틸리티, 백엔드 연동, 권한 시스템 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/prisma/claude.md`, `/src/app/claude.md`
> **참조 스킬**: `fdp-backend-architect`

---

## 1. 이 디렉토리 범위

```
/src/lib
├── claude.md               # [현재 파일]
│
│   # 핵심 유틸리티
├── utils.ts                # cn() 클래스 병합
├── prisma.ts               # Prisma 클라이언트 싱글톤
├── cache.ts                # 캐시 유틸리티
├── logger.ts               # 로깅 시스템
├── api-error.ts            # API 에러 처리
├── performance.ts          # 성능 모니터링
│
│   # 인증 & 권한
├── auth.ts                 # NextAuth 설정 (+ 관리자 Credentials provider, Node 전용)
├── auth.config.ts          # NextAuth 옵션 (Edge 미들웨어용, Prisma·crypto 금지)
├── auth-routes.ts          # 미들웨어 경로 판정, callbackUrl 정리 (import 없음)
├── auth-utils.ts           # 인증 유틸리티, 관리자 판정 getAdminSession()
├── admin-guard.ts          # /admin 페이지 가드 requireAdminPage()
├── rebac.ts                # ReBAC 권한 시스템
├── /admin-login            # 관리자 이메일 + 비밀번호 로그인
│   ├── constants.ts        #    provider id, 세션 12시간 (Edge에서도 import, import 없음)
│   ├── password.ts         #    scrypt 해시·검증
│   ├── throttle.ts         #    잠금 (admin_login_buckets: IP 20 → 쌍 5 → 이메일 50, 15분 고정 창 카운터)
│   ├── client-ip.ts        #    IP (VERCEL=1일 때만 신뢰, 운영에서 IP가 없으면 프로세스당 1회 경고)
│   ├── authorize.ts        #    Credentials authorize
│   └── submit.ts           #    /admin-login 폼 제출 ("use server" 금지)
│
│   # 비즈니스 로직
├── matching.ts             # RAG 매칭 엔진
├── rag.ts                  # RAG 검색 시스템
├── rag-access.ts           # RAG 임베딩 읽기·쓰기 권한 canAccessEmbeddings()
├── text-config.ts          # i18n 텍스트 설정
├── notifications.ts        # 알림 시스템
│
│   # 외부 서비스 연동
├── qstash.ts               # QStash 연동
├── railway.ts              # Railway 워커 연동
├── supabase-storage.ts     # Supabase Storage
│
│   # 서브 모듈
├── /crawler                # 크롤러 시스템
│   └── worker.ts           #    크롤러 워커
├── /documents              # 문서 분석 시스템
│   ├── analyzer.ts         #    Gemini Vision 분석
│   └── embeddings.ts       #    OpenAI 임베딩
├── /supabase               # Supabase 연동
│   └── client.ts           #    Supabase 클라이언트
└── /actions                # Server Actions
```

---

## 2. 유틸리티 (utils.ts)

### 2.1 cn() - 클래스 병합

```tsx
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 2.2 사용 예시

```tsx
<div className={cn(
  "base-class",
  isActive && "active-class",
  className
)} />
```

---

## 3. Prisma (prisma.ts)

### 3.1 싱글톤 패턴

```tsx
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

### 3.2 환경 변수

```env
# .env.local
DATABASE_URL="postgresql://...6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...5432/postgres"
```

---

## 4. 인증 (auth.ts)

### 4.1 NextAuth 설정

```tsx
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import { prisma } from "./prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub, Google],
  session: { strategy: "database" },
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: { ...session.user, id: user.id },
    }),
  },
})
```

### 4.2 세션 사용

```tsx
import { auth } from "@/lib/auth"

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }
  // ...
}
```

### 4.3 관리자 판정

- 관리자 = `role=admin`(매 요청 DB 조회) **그리고** 12시간 안의 비밀번호 로그인(`session.adminAuthAt`). 카카오·구글 세션은 role과 관계없이 관리자가 아니다.
- 판정은 `getAdminSession()`(`auth-utils.ts`) 하나다. `requireAdmin()`(API·서버 액션, 세션 없음 401·그 외 403)과 `requireAdminPage()`(페이지, `/admin-login?callbackUrl=%2Fadmin`으로 리다이렉트)가 이것을 쓴다. role만 보는 판정(예: `user.role === "admin"` 직접 비교)을 따로 만들지 않는다.
- `adminAuthAt`은 `auth.config.ts` jwt 콜백이 `admin-credentials` 로그인 때만 넣는다. 다른 로그인은 지우고, `trigger: "update"`·`session` 인자에서는 읽지 않는다.
- `admin-login/*`의 Prisma·`node:crypto` 코드는 `auth.ts`로만 들어간다. `admin-login/` 중 `auth.config.ts`가 import하는 것은 `constants.ts`뿐이다(`__tests__/lib/auth-edge-imports.test.ts`).
- 잠금은 `consumeAttempt()`(`admin-login/throttle.ts`) 하나다. 창은 `floor(now / 15분)` 고정 창이고 창 번호가 버킷 키(HMAC)에 들어간다. 버킷마다 native upsert 한 문장(`INSERT … ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count`)이 판정하고, 돌려받은 count가 한도 이하면 통과다. 쌍·이메일 버킷은 있든 없든 그 한 문장뿐이라 버킷 존재가 응답 시간에 드러나지 않는다. IP 버킷만 먼저 `findUnique`로 읽어 이미 한도면 쓰지 않고 거부한다(`pgbouncer=true`에서 문장마다 BEGIN…COMMIT이라, 한 IP 폭주가 한 행 잠금에 몰려 서버 연결을 붙잡지 않게). 이 읽기는 거부만 하고 통과는 늘 upsert가 정한다. 그 밖에 먼저 읽고 쓰는 코드·대화형 트랜잭션·advisory lock·raw SQL을 쓰지 않는다(PgBouncer transaction 모드, 10.1). 정리는 직전 창보다 오래된 행만 지운다. 판정 오류는 던지고, `authorizeAdmin`이 잡아 로그(이메일·IP·비밀번호 없이) 후 `null`로 거부한다.
- `authorizeAdmin`은 `ADMIN_PASSWORD_HASH`를 trim해서 쓰고, 거부 로그 `reason`을 `not_configured`(env 없음)·`malformed_hash`(`isWellFormedHash` 거짓, error 수준)·`invalid_credentials` 등으로 나눈다. 입력 검사를 통과한 시도라면 어느 경우든 시도 한 칸과 scrypt 한 번(`verifyPassword`)은 그대로다. 이메일·비밀번호가 비었거나 너무 길면(`invalid_input`) 둘 다 하지 않는다.
- `auth.ts`의 Auth.js `logger`는 `error`만 둔다: `type === "CredentialsSignin"`은 스택 없는 warn 한 줄, 나머지는 그대로 `console.error`. `debug`를 넣지 않는다(`debug: false`가 깐 no-op을 덮어써 요청 본문 로그가 살아난다).
- 운영 env·잠금·복구 절차: 루트 `claude.md` 9.7.

### 4.4 RAG 임베딩 권한 (rag-access.ts)

- `/api/rag/*`에서 `document_embeddings`를 읽거나 바꾸기 전에 `canAccessEmbeddings(userId, sourceType, sourceId, "read" | "write")`를 부른다.
  - support_project: 읽기는 로그인한 누구나, 쓰기는 관리자(`getAdminSession()`)만.
  - company: 읽기 viewer, 쓰기 company admin(owner 포함).
  - business_plan: 읽기 viewer, 쓰기 owner.
- `hybridSearch()`는 source id로 거르지 못한다. 그래서 `/api/rag/search`에서 관리자가 아니면 support_project만 검색한다(종류를 안 주면 support_project, company·business_plan을 주면 403). 서버 내부 호출(`matching.ts`, `/api/projects/search`)은 support_project만 검색한다. company·business_plan을 검색하는 서버 코드를 새로 만들면 결과를 사용자가 권한을 가진 source id로 거른다(사업계획서 생성·평가는 2026-11-17 제거).
- `/api/rag/embed` 본문은 10만 자까지다(청크마다 OpenAI 호출 한 번).
- 경계 테스트: `__tests__/app/api/rag/rag-access.test.ts`(ReBAC·관리자 판정은 실제 코드, 거부된 요청은 임베딩 함수에 닿지 않음).

---

## 5. 권한 시스템 (permissions.ts)

### 5.1 ReBAC 개념

```
owner (전체 권한)
├── editor (읽기 + 쓰기)
│   └── viewer (읽기 전용)
└── admin (시스템 레벨)
```

### 5.2 핵심 함수

```tsx
// 권한 확인
export async function check(
  userId: string,
  namespace: Namespace,
  objectId: string,
  relation: Relation
): Promise<boolean>

// 권한 부여
export async function grant(
  namespace: Namespace,
  objectId: string,
  relation: Relation,
  subjectType: SubjectType,
  subjectId: string
): Promise<void>

// 권한 해제
export async function revoke(
  namespace: Namespace,
  objectId: string,
  relation: Relation,
  subjectType: SubjectType,
  subjectId: string
): Promise<void>
```

### 5.3 사용 예시

```tsx
// 리소스 생성 시 owner 권한 부여
await grant("project", project.id, "owner", "user", userId)

// 편집 권한 확인
const canEdit = await check(userId, "project", projectId, "editor")

// 협업자 초대
await grant("project", projectId, "editor", "user", collaboratorId)
```

### 5.4 타입 정의

```tsx
export type Namespace = "project" | "document" | "system"
export type Relation = "owner" | "editor" | "viewer" | "admin"
export type SubjectType = "user" | "user_set"
```

---

## 6. i18n 텍스트 (text-config.ts)

### 6.1 구조

```tsx
const DEPLOYMENT_ENV = process.env.NEXT_PUBLIC_DEPLOYMENT_ENV || 'standalone'
const isAppsInToss = DEPLOYMENT_ENV === 'apps-in-toss'

export const BUTTON_TEXT = {
  save: isAppsInToss ? '저장해요' : '저장',
  cancel: isAppsInToss ? '취소해요' : '취소',
  confirm: isAppsInToss ? '확인해요' : '확인',
  // ...
} as const

export const STATUS_TEXT = {
  loading: isAppsInToss ? '불러오고 있어요' : '로딩 중',
  // ...
} as const
```

### 6.2 톤 코드

| 코드 | 의미 | 예시 |
|-----|------|------|
| `Confirm` | 긍정적 확인 | "저장되었습니다" |
| `Destructive` | 파괴적/위험 | "삭제하시겠습니까?" |
| `Soft` | 부드러운 안내 | "입력해 주세요" |
| `Neutral` | 중립적 정보 | "총 3개" |

---

## 7. 데이터베이스 스키마

### 7.1 필수 테이블 (3개)

| 테이블 | 용도 |
|-------|------|
| `User` | NextAuth 사용자 |
| `Account` | OAuth 계정 연동 |
| `RelationTuple` | ReBAC 권한 |

### 7.2 SaaS 테이블 (2개)

| 테이블 | 용도 |
|-------|------|
| `Subscription` | 구독 관리 |
| `CreditTransaction` | 사용량 추적 |

### 7.3 리소스 테이블 (커스터마이징)

| 테이블 | 용도 |
|-------|------|
| `Project` | 프로젝트 리소스 |
| `Document` | 문서 리소스 |

---

## 8. API 라우트 패턴

### 8.1 권한 검증 패턴

```tsx
// /app/api/projects/[id]/route.ts
import { auth } from "@/lib/auth"
import { check } from "@/lib/permissions"

export async function PATCH(req, { params }) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canEdit = await check(session.user.id, "project", params.id, "editor")
  if (!canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  // 업데이트 로직...
}
```

---

## 9. /docs 참조

| 용도 | 위치 |
|-----|------|
| 토큰 체계 | `/docs/foundations/tokens.md` |
| i18n 규칙 | `/docs/foundations/i18n.md` |
| 네이밍 체계 | `/docs/foundations/naming.md` |

---

## 10. 금지 사항

- 환경 변수 하드코딩 금지
- SQL 직접 쿼리 금지 (Prisma 사용)
- 클라이언트에 시크릿 노출 금지

---

## 11. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙, i18n 톤 코드

### 연관
- `/prisma/claude.md` → DB 스키마, Prisma 타입
- `/src/app/claude.md` → API에서 lib 함수 사용
- `/src/components/claude.md` → 컴포넌트에서 유틸리티 사용
- `/src/types/claude.md` → 타입 정의

### 주요 모듈 가이드

| 모듈 | 용도 | 주요 함수/클래스 |
|-----|------|-----------------|
| `auth.ts` | 인증 | `auth()`, `signIn()`, `signOut()` |
| `rebac.ts` | 권한 | `check()`, `grant()`, `revoke()` |
| `matching.ts` | 매칭 | `findMatches()`, `calculateScore()` |
| `rag.ts` | RAG | `searchSimilar()`, `generateEmbedding()` |
| `/crawler` | 크롤링 | `CrawlerWorker`, `parseProject()` |
| `/documents` | 문서 분석 | `analyzeDocument()`, `createEmbeddings()` |

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 생성 |
| 2025-12-05 | /docs 참조 섹션 추가 |
| 2025-12-15 | 허브 연결 섹션 추가, 디렉토리 구조 확장 |
| 2026-11-17 | 4.3 관리자 판정(`getAdminSession` 하나), `/admin-login` 모듈 구조 추가 |
| 2026-11-17 | 4.3 잠금 IP 버킷 선읽기, 거부 `reason` 분리·해시 trim, Auth.js `logger`, IP 없음 경고 |
| 2026-11-17 | 4.4 RAG 임베딩 권한(`rag-access.ts`) |
| 2026-11-17 | 사업계획서 생성·평가 제거(`business-plan-generator`·`evaluation-engine`·`export` 등) |
