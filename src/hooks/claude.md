# Hooks 가이드

> **역할**: 커스텀 React 훅 개발 가이드
> **상위 허브**: `/CLAUDE.md` (루트 헌법)
> **연관 가이드**: `/src/components/claude.md`, `/src/lib/claude.md`

---

## 1. 디렉토리 구조

```
/src/hooks
├── claude.md           # [현재 파일]
├── use-loading.ts      # 로딩 상태 관리 훅
└── (확장 예정)
```

---

## 2. 현재 제공 훅

### 2.1 use-loading.ts

| 훅 | 용도 | 반환값 |
|---|------|-------|
| `useLoading` | 단순 로딩 상태 | `{ isLoading, startLoading, stopLoading }` |
| `useAsyncLoading` | 비동기 작업 래퍼 | `{ execute, isLoading, error }` |
| `useMultipleLoading` | 다중 로딩 상태 | `{ startLoading(key), isLoading(key) }` |
| `useMinimumLoading` | 최소 지속시간 로딩 | 플래시 방지 (기본 500ms) |

### 2.2 사용 예시

```tsx
// 단순 로딩
const { isLoading, startLoading, stopLoading } = useLoading()

// 비동기 작업
const { execute, isLoading } = useAsyncLoading(async () => {
  await api.fetchData()
})

// 다중 로딩
const { startLoading, isLoading } = useMultipleLoading()
startLoading("save")
startLoading("upload")
```

---

## 3. 훅 개발 규칙

### 3.1 네이밍 컨벤션

```
use{Domain}{Action}.ts

예시:
- use-loading.ts      → useLoading
- use-auth.ts         → useAuth
- use-form-state.ts   → useFormState
```

### 3.2 파일 구조

```tsx
/**
 * {훅 이름}
 * {간단한 설명}
 */

import { useState, useCallback } from "react"

/**
 * {훅 설명}
 * @param {파라미터 설명}
 * @returns {반환값 설명}
 */
export function useHookName(params) {
  // 상태 정의
  const [state, setState] = useState()

  // 콜백 정의 (useCallback 사용)
  const action = useCallback(() => {
    // ...
  }, [dependencies])

  // 반환
  return { state, action }
}
```

### 3.3 필수 규칙

- **use 접두사**: 모든 훅은 `use`로 시작
- **useCallback**: 함수 반환 시 메모이제이션
- **의존성 배열**: 정확하게 명시
- **타입 정의**: TypeScript 제네릭 활용

---

## 4. 훅 분류

### 4.1 상태 관리 훅

```tsx
// 로딩, 에러, 폼 상태 등
useLoading()
useFormState()
useToggle()
```

### 4.2 데이터 페칭 훅

```tsx
// API 호출, 캐싱
useFetch()
useInfiniteScroll()
```

### 4.3 UI 훅

```tsx
// 모달, 토스트, 포커스
useModal()
useToast()
useFocusTrap()
```

### 4.4 유틸리티 훅

```tsx
// 디바운스, 스로틀, 로컬 스토리지
useDebounce()
useLocalStorage()
useMediaQuery()
```

---

## 5. 테스트 패턴

```tsx
import { renderHook, act } from "@testing-library/react"
import { useLoading } from "./use-loading"

describe("useLoading", () => {
  it("초기값이 false", () => {
    const { result } = renderHook(() => useLoading())
    expect(result.current.isLoading).toBe(false)
  })

  it("startLoading 호출 시 true", () => {
    const { result } = renderHook(() => useLoading())
    act(() => {
      result.current.startLoading()
    })
    expect(result.current.isLoading).toBe(true)
  })
})
```

---

## 6. 허브 연결

### 상위
- `/CLAUDE.md` → 전역 원칙

### 연관
- `/src/components/claude.md` → 컴포넌트에서 훅 사용
- `/src/lib/claude.md` → 백엔드 로직 연동

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-15 | 초기 생성 |
