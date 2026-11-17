# App Router 가이드

> **역할**: Next.js App Router, 페이지, API Routes 개발 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/src/components/claude.md`, `/src/lib/claude.md`

---

## 1. 디렉토리 구조

```
/src/app
├── claude.md              # [현재 파일]
├── globals.css            # 디자인 토큰 (CSS Variables)
├── layout.tsx             # 루트 레이아웃
├── page.tsx               # 랜딩 페이지
├── providers.tsx          # 전역 Provider 래퍼
│
├── /(app)                 # 🔐 인증된 사용자 라우트 그룹
│   ├── layout.tsx         #    인증 체크 + 네비게이션
│   ├── /dashboard         #    대시보드
│   ├── /companies         #    기업 관리 (CRUD)
│   ├── /projects          #    지원사업 조회
│   ├── /matching          #    매칭 시스템
│   ├── /business-plans    #    사업계획서
│   ├── /evaluations       #    평가 시스템
│   └── /settings          #    사용자 설정
│
├── /admin                 # 👑 관리자 전용 라우트
│   ├── layout.tsx         #    관리자 권한 체크
│   ├── /crawler           #    크롤러 대시보드
│   ├── /projects          #    프로젝트 관리
│   └── /users             #    사용자 관리
│
├── /api                   # 🔌 API Routes
│   ├── /auth              #    NextAuth 핸들러
│   ├── /companies         #    기업 API
│   ├── /projects          #    프로젝트 API
│   ├── /matching          #    매칭 API
│   ├── /documents         #    문서 분석 API
│   ├── /evaluations       #    평가 API
│   ├── /rag               #    RAG 검색 API
│   ├── /cron              #    Cron Job 엔드포인트
│   └── /admin             #    관리자 API
│
├── /login                 # 로그인 페이지 (카카오·구글)
├── /admin-login           # 관리자 로그인 (이메일 + 비밀번호)
└── /companies/[id]        # 공개 기업 프로필 (SEO)
```

---

## 2. 라우트 그룹 패턴

### 2.1 (app) 그룹 - 인증 필수

```tsx
// /(app)/layout.tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AppLayout({ children }) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}
```

### 2.2 admin 그룹 - 관리자 전용

레이아웃은 접근 경계가 아니다(클라이언트 내비게이션 형식의 요청은 레이아웃 없이 페이지만 렌더링한다). `/admin/**`의 **모든 `page`·`layout`·`template`·`default`는 첫 `await`로 `requireAdminPage()`를 호출**한다. `generateMetadata`·`generateViewport`를 내보내면 그 함수도 같다. `/admin` 아래에 `route.ts`는 두지 않는다(관리자 API는 `/api/admin`). `__tests__/app/admin-page-guard.test.ts`가 디스크의 파일 전부에 대해 이를 강제한다.

관리자 = `role=admin` + 12시간 안의 비밀번호 로그인(`/admin-login`). 카카오·구글 세션은 role과 관계없이 관리자가 아니다. `requireAdminPage()`(페이지)와 `requireAdmin()`(API·서버 액션)은 같은 `getAdminSession()`으로 판정한다. `/admin-login`은 소셜 세션에도 폼을 렌더링한다(돌려보내면 `/admin` 가드와 루프가 난다). 관리자 레이아웃에 로그아웃 버튼(`signOut({ redirectTo: "/admin-login" })`)이 있다.

```tsx
// /admin/**/page.tsx (layout.tsx도 같은 가드를 쓴다)
import { requireAdminPage } from "@/lib/admin-guard"

export default async function AdminUsersPage() {
  await requireAdminPage() // 관리자가 아니면(비로그인·소셜 세션·12시간 초과·role 회수) → /admin-login
  const users = await prisma.user.findMany()
  // ...
}
```

---

## 3. 페이지 개발 패턴

### 3.1 서버 컴포넌트 (기본)

```tsx
// 데이터 페칭이 필요한 페이지
export default async function ProjectsPage() {
  const projects = await prisma.project.findMany()
  return <ProjectList projects={projects} />
}
```

### 3.2 동적 라우트

```tsx
// /projects/[id]/page.tsx
interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })

  if (!project) {
    notFound()
  }

  return <ProjectDetail project={project} />
}
```

### 3.3 클라이언트 컴포넌트

```tsx
"use client"

import { useState } from "react"

export function InteractiveForm() {
  const [data, setData] = useState(null)
  // ...
}
```

---

## 4. API Routes 패턴

### 4.1 기본 CRUD

```tsx
// /api/companies/route.ts
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

// GET - 목록 조회
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const companies = await prisma.company.findMany({
    where: { /* 사용자 권한 필터 */ }
  })

  return NextResponse.json(companies)
}

// POST - 생성
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const company = await prisma.company.create({ data: body })

  return NextResponse.json(company, { status: 201 })
}
```

### 4.2 동적 라우트 API

```tsx
// /api/companies/[id]/route.ts
interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params
  // ...
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  // ReBAC 권한 체크 필수
  const canEdit = await check(userId, "company", id, "editor")
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // ...
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params
  // ReBAC owner 권한 필요
  // ...
}
```

### 4.3 ReBAC 권한 패턴

```tsx
import { check } from "@/lib/rebac"

// 권한 체크 순서
// 1. 인증 확인
// 2. ReBAC 권한 확인
// 3. 비즈니스 로직

const session = await auth()
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

const canEdit = await check(session.user.id, "company", companyId, "editor")
if (!canEdit) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

---

## 5. Cron Jobs

### 5.1 위치

```
/api/cron
├── /generate-embeddings    # 임베딩 생성 (01:00 KST)
└── /crawl                  # 크롤링 트리거 (05:00 KST)
```

### 5.2 Vercel Cron 설정

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/generate-embeddings",
      "schedule": "0 16 * * *"  // UTC 16:00 = KST 01:00
    }
  ]
}
```

---

## 6. 파일 컨벤션

| 파일 | 용도 |
|-----|------|
| `page.tsx` | 라우트 UI |
| `layout.tsx` | 중첩 레이아웃 |
| `loading.tsx` | 로딩 UI (Suspense) |
| `error.tsx` | 에러 바운더리 |
| `not-found.tsx` | 404 페이지 |
| `route.ts` | API 엔드포인트 |

---

## 7. 주요 도메인 라우트

### 7.1 Companies (기업 관리)

| 라우트 | 용도 |
|-------|------|
| `/(app)/companies` | 기업 목록 |
| `/(app)/companies/new` | 기업 등록 |
| `/(app)/companies/[id]` | 기업 상세 |
| `/(app)/companies/[id]/edit` | 기업 수정 |
| `/companies/[id]` | 공개 프로필 (SEO) |

### 7.2 Projects (지원사업)

| 라우트 | 용도 |
|-------|------|
| `/(app)/projects` | 지원사업 검색 |
| `/(app)/projects/[id]` | 사업 상세 |

### 7.3 Matching (매칭)

| 라우트 | 용도 |
|-------|------|
| `/(app)/matching` | 매칭 홈 |
| `/(app)/matching/new` | 새 매칭 실행 |
| `/(app)/matching/results` | 매칭 결과 목록 |
| `/(app)/matching/results/[id]` | 결과 상세 |

---

## 8. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙, 버튼 규칙, i18n

### 연관
- `/src/components/claude.md` → UI 컴포넌트
- `/src/lib/claude.md` → Auth, ReBAC, Prisma
- `/prisma/claude.md` → DB 스키마

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-15 | 초기 생성 |
| 2026-11-16 | 2.2 admin: 페이지별 `requireAdminPage()` 가드로 정정 |
| 2026-11-16 | `/access-denied` 추가, 비관리자 리다이렉트 대상 변경 |
| 2026-11-17 | `/access-denied` 제거, 관리자 로그인 `/admin-login`(이메일 + 비밀번호)으로 대체, 관리자 판정 설명 추가 |
