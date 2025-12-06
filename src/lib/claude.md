# Lib 가이드 (유틸리티 & 백엔드)

> **역할**: 유틸리티, 백엔드 연동, 권한 시스템 가이드
> **상위**: `/claude.md` (루트 헌법)
> **참조 스킬**: `fdp-backend-architect`

---

## 1. 이 디렉토리 범위

```
/src/lib
├── claude.md          # [현재 파일]
├── utils.ts           # 유틸리티 함수 (cn 등)
├── prisma.ts          # Prisma 클라이언트 싱글톤
├── auth.ts            # NextAuth 설정
├── permissions.ts     # ReBAC 권한 시스템
└── text-config.ts     # i18n 텍스트 설정
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

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 생성 |
| 2025-12-05 | /docs 참조 섹션 추가 |
