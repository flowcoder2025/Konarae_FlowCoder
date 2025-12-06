# {컴포넌트명} 스펙

> **목적**: {이 컴포넌트가 해결하는 문제}
> **범위**: {어디에서 사용되는가}
> **구현**: `/src/components/ui/{name}.tsx`

---

## 1. 역할

{컴포넌트의 주요 역할과 책임}

---

## 2. Variants

| Variant | 용도 | 사용 빈도 |
|---------|------|----------|
| `default` | {용도} | {빈도} |
| `{variant2}` | {용도} | {빈도} |

---

## 3. Props

| Prop | Type | Default | 설명 |
|------|------|---------|------|
| `variant` | `string` | `"default"` | {설명} |
| `size` | `string` | `"default"` | {설명} |
| `className` | `string` | - | 추가 클래스 |

---

## 4. 상태 (States)

| 상태 | 설명 | 스타일 |
|-----|------|-------|
| `default` | 기본 상태 | {스타일} |
| `hover` | 마우스 오버 | {스타일} |
| `active` | 클릭 중 | {스타일} |
| `disabled` | 비활성 | {스타일} |

---

## 5. 토큰 연결

### 5.1 Color Tokens
```
{토큰 매핑}
```

### 5.2 Spacing Tokens
```
{토큰 매핑}
```

---

## 6. 네이밍/i18n 연결

| 네이밍 패턴 | 예시 |
|-----------|------|
| `BTN.{DOMAIN}.{CONTEXT}` | `BTN.AUTH.LOGIN` |
| `LID.{DOMAIN}.{CONTEXT}` | `LID.AUTH.LOGIN.TITLE` |

---

## 7. 접근성 요구사항

- [ ] {접근성 요구사항 1}
- [ ] {접근성 요구사항 2}

---

## 8. 규칙

### 8.1 허용
```tsx
✅ {허용되는 패턴}
```

### 8.2 금지
```tsx
❌ {금지되는 패턴}
```

---

## 9. 최소 예시

```tsx
import { {ComponentName} } from "@/components/ui"

// 기본 사용
<{ComponentName}>
  {children}
</{ComponentName}>

// Variant 사용
<{ComponentName} variant="{variant}">
  {children}
</{ComponentName}>
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| YYYY-MM-DD | 초기 작성 |
