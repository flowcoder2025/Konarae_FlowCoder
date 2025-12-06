# 디자인 토큰 (Design Tokens)

> **목적**: 프로젝트 전체의 시각적 일관성을 위한 토큰 체계 정의
> **범위**: Color, Spacing, Radius, Shadow, Typography
> **핵심 원칙**: "Primary Color만 바꾸면 브랜드 완성"

---

## 1. Color Tokens

### 1.1 Primary (브랜드 컬러)

```css
/* 이 값만 변경하면 전체 브랜드 변경 */
--primary: hsl(168 64% 50%);        /* Teal 기본값 */
--primary-foreground: hsl(0 0% 100%);
```

**변경 예시**:
| 브랜드 | --primary 값 |
|-------|-------------|
| Teal (기본) | `hsl(168 64% 50%)` |
| Blue | `hsl(220 90% 56%)` |
| Purple | `hsl(270 70% 60%)` |
| Orange | `hsl(25 95% 55%)` |

### 1.2 Semantic Colors

| 토큰 | 용도 | Light | Dark |
|-----|------|-------|------|
| `--background` | 배경 | `0 0% 100%` | `0 0% 3.9%` |
| `--foreground` | 텍스트 | `0 0% 3.9%` | `0 0% 98%` |
| `--muted` | 보조 배경 | `0 0% 96.1%` | `0 0% 14.9%` |
| `--muted-foreground` | 보조 텍스트 | `0 0% 45.1%` | `0 0% 63.9%` |
| `--border` | 테두리 | `0 0% 89.8%` | `0 0% 14.9%` |
| `--destructive` | 위험/삭제 | `0 84.2% 60.2%` | `0 62.8% 30.6%` |

### 1.3 Component Colors

| 토큰 | 용도 |
|-----|------|
| `--card` | 카드 배경 |
| `--card-foreground` | 카드 텍스트 |
| `--accent` | 강조 배경 |
| `--accent-foreground` | 강조 텍스트 |
| `--ring` | 포커스 링 (= primary) |

---

## 2. Spacing Tokens

Tailwind 표준 4px 단위 사용:

| 토큰 | 값 | Tailwind |
|-----|-----|----------|
| `--space-1` | 4px | `p-1`, `m-1` |
| `--space-2` | 8px | `p-2`, `m-2` |
| `--space-3` | 12px | `p-3`, `m-3` |
| `--space-4` | 16px | `p-4`, `m-4` |
| `--space-6` | 24px | `p-6`, `m-6` |
| `--space-8` | 32px | `p-8`, `m-8` |

### 컴포넌트별 간격

| 컴포넌트 | 내부 패딩 | 외부 간격 |
|---------|----------|----------|
| Button | `px-5 py-2` | `gap-2` (아이콘) |
| Card | `p-6` | `gap-4` |
| Section | `py-12 md:py-16` | - |
| Container | `px-4 sm:px-6` | - |

---

## 3. Radius Tokens

| 토큰 | 값 | 용도 |
|-----|-----|------|
| `--radius-sm` | 0.25rem (4px) | 작은 요소 |
| `--radius-md` | 0.375rem (6px) | 입력 필드 |
| `--radius-lg` | 0.5rem (8px) | 버튼, 카드 |
| `--radius-xl` | 0.75rem (12px) | 모달 |
| `--radius-full` | 9999px | CTA 버튼, 아바타 |

---

## 4. Shadow Tokens

| 토큰 | 용도 | 값 |
|-----|------|-----|
| `--shadow-sm` | 미세 그림자 | `0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-md` | 카드 | `0 4px 6px rgba(0,0,0,0.1)` |
| `--shadow-lg` | 호버 | `0 10px 15px rgba(0,0,0,0.1)` |
| `--shadow-primary` | CTA 호버 | `0 10px 15px var(--primary)/25%` |

---

## 5. Typography Tokens

### 5.1 Font Family

```css
--font-sans: "Geist", system-ui, sans-serif;
--font-mono: "Geist Mono", monospace;
```

### 5.2 Font Size

| 토큰 | 값 | Tailwind |
|-----|-----|----------|
| `--text-xs` | 0.75rem | `text-xs` |
| `--text-sm` | 0.875rem | `text-sm` |
| `--text-base` | 1rem | `text-base` |
| `--text-lg` | 1.125rem | `text-lg` |
| `--text-xl` | 1.25rem | `text-xl` |
| `--text-2xl` | 1.5rem | `text-2xl` |
| `--text-3xl` | 1.875rem | `text-3xl` |
| `--text-4xl` | 2.25rem | `text-4xl` |

### 5.3 Font Weight

| 토큰 | 값 | 용도 |
|-----|-----|------|
| `--font-normal` | 400 | 본문 |
| `--font-medium` | 500 | 강조 본문 |
| `--font-semibold` | 600 | 부제목 |
| `--font-bold` | 700 | 제목 |

---

## 6. 규칙

### 6.1 허용

```css
✅ bg-primary                    /* 토큰 사용 */
✅ text-muted-foreground         /* 시맨틱 토큰 */
✅ rounded-lg                    /* Tailwind 표준 */
```

### 6.2 금지

```css
❌ bg-[#2DD4BF]                  /* 하드코딩 금지 */
❌ text-[#666]                   /* 직접 색상 금지 */
❌ p-[13px]                      /* 임의 값 금지 */
```

### 6.3 Variant 확장 금지 원칙

```
❌ 새 버튼 variant 추가
✅ 기존 토큰/semantic 조합으로 해결
```

예: "연한 Primary 버튼" 필요 시
```tsx
// ❌ 새 variant 추가
variant: { "primary-light": "bg-primary/10 text-primary" }

// ✅ 토큰 조합
<Button className="bg-primary/10 text-primary">
```

---

## 7. 최소 예시

### Primary Color 변경

```css
/* /src/app/globals.css */
:root {
  /* 이 한 줄만 변경 */
  --primary: hsl(220 90% 56%);  /* Blue 브랜드로 변경 */
}
```

### 반응형 섹션 패딩

```tsx
<Section spacing="lg">  {/* py-16 md:py-24 lg:py-32 */}
  <Container>
    ...
  </Container>
</Section>
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
