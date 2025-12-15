# Types 가이드

> **역할**: TypeScript 타입 정의 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/prisma/claude.md`, `/src/lib/claude.md`

---

## 1. 디렉토리 구조

```
/src/types
├── claude.md           # [현재 파일]
├── next-auth.d.ts      # NextAuth 타입 확장
└── (확장 예정)
```

---

## 2. 현재 타입 정의

### 2.1 next-auth.d.ts

NextAuth 세션 타입 확장:

```tsx
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string      // 사용자 ID 추가
    } & DefaultSession["user"]
  }
}
```

---

## 3. 타입 분류 체계

### 3.1 모듈 확장 (Declaration Merging)

```tsx
// 외부 라이브러리 타입 확장
// 파일명: {library}.d.ts
declare module "library-name" {
  interface ExistingInterface {
    newProperty: string
  }
}
```

### 3.2 도메인 타입

```tsx
// 도메인별 타입 정의
// 파일명: {domain}.types.ts

// 예: company.types.ts
export interface Company {
  id: string
  name: string
  businessNumber: string
  // ...
}

export type CompanyRole = "owner" | "admin" | "member" | "viewer"
```

### 3.3 API 타입

```tsx
// API 요청/응답 타입
// 파일명: api.types.ts

export interface ApiResponse<T> {
  data: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
}
```

### 3.4 유틸리티 타입

```tsx
// 공통 유틸리티 타입
// 파일명: utils.types.ts

export type Nullable<T> = T | null
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
```

---

## 4. 네이밍 컨벤션

### 4.1 파일명

| 패턴 | 용도 | 예시 |
|-----|------|------|
| `{name}.d.ts` | 선언 파일 (모듈 확장) | `next-auth.d.ts` |
| `{name}.types.ts` | 도메인 타입 | `company.types.ts` |

### 4.2 타입명

| 패턴 | 용도 | 예시 |
|-----|------|------|
| `I{Name}` | 인터페이스 (선택적) | `ICompany` |
| `{Name}` | 인터페이스 (권장) | `Company` |
| `{Name}Type` | 타입 별칭 | `CompanyType` |
| `{Name}Props` | 컴포넌트 Props | `ButtonProps` |
| `{Name}State` | 상태 타입 | `FormState` |
| `{Name}Response` | API 응답 | `CompanyResponse` |
| `{Name}Request` | API 요청 | `CreateCompanyRequest` |

---

## 5. Prisma 타입 활용

### 5.1 Prisma 생성 타입 사용

```tsx
import { Company, User, SupportProject } from "@prisma/client"

// Prisma 타입 그대로 사용
function getCompany(id: string): Promise<Company> {
  return prisma.company.findUnique({ where: { id } })
}
```

### 5.2 확장 타입 정의

```tsx
import { Company, CompanyMember } from "@prisma/client"

// 관계 포함 타입
type CompanyWithMembers = Company & {
  members: CompanyMember[]
}

// 부분 타입
type CompanyPreview = Pick<Company, "id" | "name" | "logoUrl">
```

---

## 6. 타입 가드

```tsx
// 타입 가드 함수
export function isCompanyOwner(role: CompanyRole): role is "owner" {
  return role === "owner"
}

// 사용
if (isCompanyOwner(member.role)) {
  // member.role은 "owner"로 타입 좁힘
}
```

---

## 7. 제네릭 패턴

```tsx
// API 응답 래퍼
export interface ApiResult<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// 사용
type CompanyResult = ApiResult<Company>
```

---

## 8. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙

### 연관
- `/prisma/claude.md` → Prisma 생성 타입
- `/src/lib/claude.md` → 유틸리티 타입 사용
- `/src/components/claude.md` → Props 타입

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-15 | 초기 생성 |
