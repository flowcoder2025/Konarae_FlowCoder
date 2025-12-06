# Button 스펙

> **목적**: 사용자 액션을 트리거하는 인터랙티브 요소
> **범위**: CTA, 폼 제출, 네비게이션, 모달 액션 등 모든 클릭 가능한 액션
> **구현**: `/src/components/ui/button.tsx`

---

## 1. 역할

- 사용자의 의도를 시스템에 전달하는 주요 인터랙션 포인트
- 시각적 계층 구조로 액션의 중요도 표현
- 상태 피드백 (hover, active, disabled, loading)

---

## 2. Variants

### 2.1 주사용 (Primary Use)

| Variant | 용도 | 사용 빈도 | Semantic |
|---------|------|----------|----------|
| `default` | 주요 액션 (CTA, 제출) | ⭐⭐⭐ 매우 높음 | Primary |
| `outline` | 보조 액션 (취소, 더 보기) | ⭐⭐⭐ 매우 높음 | Secondary |

### 2.2 예비 (Reserved - 사용자 요청 시)

| Variant | 용도 | 사용 조건 | Semantic |
|---------|------|----------|----------|
| `destructive` | 위험 액션 (삭제, 탈퇴) | 사용자 명시적 요청 | Danger |
| `ghost` | 최소 강조 (네비게이션) | 사용자 명시적 요청 | Neutral |

---

## 3. Props

| Prop | Type | Default | 설명 |
|------|------|---------|------|
| `variant` | `"default" \| "outline" \| "destructive" \| "ghost"` | `"default"` | 버튼 스타일 |
| `size` | `"sm" \| "default" \| "lg" \| "xl" \| "icon"` | `"default"` | 버튼 크기 |
| `rounded` | `"default" \| "md" \| "lg" \| "xl" \| "full"` | `"full"` | 모서리 둥글기 |
| `disabled` | `boolean` | `false` | 비활성 상태 |
| `asChild` | `boolean` | `false` | Slot 패턴 사용 |

---

## 4. 상태 (States)

| 상태 | 트리거 | 스타일 변화 |
|-----|-------|-----------|
| `default` | 초기 | 기본 색상 |
| `hover` | 마우스 오버 | `-translate-y-0.5`, `shadow-lg` |
| `active` | 클릭 중 | `translate-y-0` |
| `focus-visible` | Tab 포커스 | `ring-2 ring-ring` |
| `disabled` | `disabled` prop | `opacity-50`, 클릭 불가 |
| `loading` | 로딩 중 | 스피너 표시, `aria-busy` |

---

## 5. 토큰 연결

### 5.1 Color Tokens

| Variant | Background | Text | Border |
|---------|------------|------|--------|
| `default` | `bg-primary` | `text-primary-foreground` | - |
| `outline` | `bg-background` | `text-foreground` | `border-border` |
| `destructive` | `bg-destructive` | `text-white` | - |
| `ghost` | transparent | `text-foreground` | - |

### 5.2 Size Tokens

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| `sm` | `h-8` | `px-4` | `text-xs` |
| `default` | `h-10` | `px-5` | `text-sm` |
| `lg` | `h-12` | `px-8` | `text-base` |
| `xl` | `h-14` | `px-10` | `text-lg` |
| `icon` | `size-10` | - | - |

---

## 6. 네이밍/i18n 연결

| 용도 | 네이밍 패턴 | text-config 키 |
|-----|-----------|---------------|
| 로그인 | `BTN.AUTH.LOGIN` | `BUTTON_TEXT.login` |
| 저장 | `BTN.PRIMARY.SAVE` | `BUTTON_TEXT.save` |
| 취소 | `BTN.SECONDARY.CANCEL` | `BUTTON_TEXT.cancel` |
| 삭제 | `BTN.DANGER.DELETE` | `BUTTON_TEXT.delete` |

---

## 7. 접근성 요구사항

- [x] 포커스 시 `ring-2` 표시
- [x] `disabled` 상태에서 `pointer-events-none`
- [x] 아이콘 버튼에 `aria-label` 필수
- [x] 로딩 상태에 `aria-busy="true"`
- [x] 충분한 터치 영역 (최소 44x44px)

---

## 8. 규칙

### 8.1 허용

```tsx
✅ <Button>저장</Button>                    // default variant
✅ <Button variant="outline">취소</Button>  // outline variant
✅ <Button size="lg" rounded="full">CTA</Button>  // CTA 스타일
✅ <Button size="icon" aria-label="메뉴"><MenuIcon /></Button>
```

### 8.2 금지

```tsx
❌ <Button variant="success">성공</Button>  // 존재하지 않는 variant
❌ <Button className="bg-[#xxx]">...</Button>  // 토큰 우회
❌ <Button size="icon">아이콘</Button>  // aria-label 누락
❌ 한 화면에 default 버튼 3개 이상  // 시선 분산
```

### 8.3 Variant 확장 금지

```
❌ 새로운 variant 추가 금지
✅ 기존 variant + className 조합으로 해결
```

---

## 9. 최소 예시

### 기본 사용

```tsx
import { Button } from "@/components/ui"
import { getText } from "@/lib/text-config"

// CTA 버튼
<Button size="lg">
  {getText("BTN.CTA.START")}
</Button>

// 보조 버튼
<Button variant="outline">
  {getText("BTN.SECONDARY.CANCEL")}
</Button>
```

### 버튼 조합 패턴

```tsx
// 일반 확인
<HStack gap={4}>
  <Button variant="outline">취소</Button>
  <Button>확인</Button>
</HStack>

// 삭제 확인
<HStack gap={4}>
  <Button variant="outline">취소</Button>
  <Button variant="destructive">삭제</Button>
</HStack>

// CTA 섹션
<HStack gap={4}>
  <Button size="lg">시작하기</Button>
  <Button variant="outline" size="lg">자세히 보기</Button>
</HStack>
```

### 아이콘 버튼

```tsx
import { Menu, X } from "lucide-react"

<Button size="icon" variant="ghost" aria-label="메뉴 열기">
  <Menu className="size-5" />
</Button>

<Button size="icon" variant="ghost" aria-label="닫기">
  <X className="size-5" />
</Button>
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
