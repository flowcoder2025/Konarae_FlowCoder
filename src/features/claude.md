# Features 가이드 (기능 모듈)

> **역할**: 기능별 모듈 개발 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/src/components/claude.md`, `/src/lib/claude.md`

---

## 1. 이 디렉토리 범위

```
/src/features
├── claude.md          # [현재 파일]
├── /auth              # 인증 기능
│   └── claude.md      # 인증 로컬 가이드
├── /dashboard         # 대시보드 기능
│   └── claude.md
├── /projects          # 프로젝트 관리
│   └── claude.md
└── /settings          # 설정 기능
    └── claude.md
```

---

## 2. Feature 구조 패턴

### 2.1 기본 구조

```
/features/{feature-name}
├── claude.md           # 기능 로컬 가이드
├── /components         # 기능 전용 컴포넌트
├── /hooks              # 기능 전용 훅
├── /api                # API 라우트 (또는 /app/api에서 import)
├── /types              # 타입 정의
└── index.ts            # 통합 export
```

### 2.2 예시: auth 기능

```
/features/auth
├── claude.md
├── /components
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   └── OAuthButtons.tsx
├── /hooks
│   └── useAuth.ts
├── /types
│   └── auth.types.ts
└── index.ts
```

---

## 3. Feature 개발 규칙

### 3.1 컴포넌트 참조

```tsx
// 공통 UI는 @/components/ui에서
import { Button, Card } from "@/components/ui"

// 기능 전용은 로컬에서
import { LoginForm } from "./components/LoginForm"
```

### 3.2 네이밍 (SID/LID/BTN)

각 Feature의 claude.md에 관련 ID 명시:

```markdown
## 관련 ID

### Screens (SID)
- SID.AUTH.LOGIN.001 - 로그인 페이지
- SID.AUTH.SIGNUP.001 - 회원가입 페이지

### Labels (LID)
- LID.AUTH.LOGIN.TITLE.001 - "로그인"
- LID.AUTH.LOGIN.EMAIL.001 - "이메일"

### Buttons (BTN)
- BTN.AUTH.LOGIN.SUBMIT.001 - 로그인 버튼
- BTN.AUTH.OAUTH.GITHUB.001 - GitHub 로그인
```

### 3.3 상태 관리

- 로컬 상태: React useState
- 서버 상태: React Query / SWR
- 전역 상태: Zustand (필요시)

---

## 4. Feature별 claude.md 템플릿

```markdown
# {Feature Name} 가이드

> **역할**: {기능 설명}
> **상위**: `/src/features/claude.md`

---

## 1. 기능 범위

{이 기능이 담당하는 범위 설명}

## 2. 디렉토리 구조

{폴더 트리}

## 3. 관련 ID

### Screens (SID)
{화면 ID 목록}

### Labels (LID)
{라벨 ID 목록}

### Buttons (BTN)
{버튼 ID 목록}

## 4. 재사용 컴포넌트

{@/components/ui에서 사용하는 컴포넌트}

## 5. 상태/이벤트/가드

{State Machine 정의 - 복잡한 플로우가 있는 경우}

## 6. i18n 톤 규칙

{이 기능에서 사용하는 톤 코드}

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
```

---

## 5. /docs 참조

| 용도 | 위치 |
|-----|------|
| 네이밍 체계 | `/docs/foundations/naming.md` |
| i18n 규칙 | `/docs/foundations/i18n.md` |
| 접근성 체크리스트 | `/docs/checklists/a11y.md` |
| 새 컴포넌트 프로세스 | `/docs/workflow/new-component.md` |

---

## 6. 새 Feature 추가 절차

> ⚠️ 토큰 효율 원칙: 문서는 요청 시만 작성

```
1. `/src/features/{name}` 디렉토리 생성
2. 기본 구조 생성 (components, hooks, types, index.ts)
3. 관련 ID 정의 (SID/LID/BTN)
4. `/src/features/{name}/claude.md` 작성 (위 템플릿 사용)
5. (선택) 사용자 요청 시 이 파일 디렉토리 구조 업데이트
```

---

## 7. 기존 Feature 가이드

### 7.1 Auth (/auth)

| 항목 | 내용 |
|-----|------|
| 범위 | 로그인, 회원가입, OAuth, 세션 관리 |
| 권한 | 미인증 사용자 접근 가능 |
| 상태 | 세션 기반 (NextAuth) |

### 7.2 Dashboard (/dashboard)

| 항목 | 내용 |
|-----|------|
| 범위 | 메인 대시보드, 통계, 최근 활동 |
| 권한 | 인증된 사용자만 |
| 상태 | 서버 컴포넌트 우선 |

### 7.3 Projects (/projects)

| 항목 | 내용 |
|-----|------|
| 범위 | 프로젝트 CRUD, 협업, 공유 |
| 권한 | owner/editor/viewer 기반 |
| 상태 | ReBAC 권한 시스템 연동 |

### 7.4 Settings (/settings)

| 항목 | 내용 |
|-----|------|
| 범위 | 프로필, 구독, 알림 설정 |
| 권한 | 본인만 |
| 상태 | 폼 상태 관리 |

---

## 8. 금지 사항

- 루트 전역 원칙 재정의 금지
- 공통 컴포넌트 복사/수정 금지 (확장만 허용)
- 다른 Feature 직접 import 금지 (공유 필요시 /lib로 이동)

---

## 9. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙, 네이밍 체계

### 연관
- `/src/components/claude.md` → 공통 UI 컴포넌트 사용
- `/src/lib/claude.md` → 백엔드 로직, 권한 시스템
- `/src/hooks/claude.md` → 커스텀 훅 사용
- `/src/app/claude.md` → 페이지에서 Feature 모듈 사용

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 생성 |
| 2025-12-05 | /docs 참조 섹션 추가, 토큰 효율 원칙 적용 |
| 2025-12-15 | 허브 연결 섹션 추가 |
