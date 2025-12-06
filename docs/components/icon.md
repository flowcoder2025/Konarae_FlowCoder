# Icon 스펙

> **목적**: 시각적 커뮤니케이션을 위한 아이콘 사용 규격 정의
> **범위**: 버튼, 네비게이션, 상태 표시, 장식 등 모든 아이콘 사용처
> **라이브러리**: `lucide-react`

---

## 1. 역할

- 텍스트를 보완하는 시각적 단서 제공
- 빠른 인식과 스캔 지원
- 공간 효율적인 정보 전달

---

## 2. 사이즈 체계

| Size | 값 | Tailwind | 용도 |
|------|-----|----------|------|
| `xs` | 12px | `size-3` | 인라인 텍스트 |
| `sm` | 16px | `size-4` | 버튼 내 아이콘 |
| `default` | 20px | `size-5` | 일반 UI |
| `lg` | 24px | `size-6` | 강조 아이콘 |
| `xl` | 32px | `size-8` | 히어로/피처 |

---

## 3. 컬러 규칙

| 용도 | Color Token |
|-----|-------------|
| 기본 | `text-foreground` |
| 보조 | `text-muted-foreground` |
| 브랜드 | `text-primary` |
| 성공 | `text-green-600` |
| 경고 | `text-yellow-600` |
| 에러 | `text-destructive` |

---

## 4. 네이밍 규칙

### 4.1 아이콘 선택 기준

| 의미 | 아이콘 | Import |
|-----|-------|--------|
| 닫기 | X | `X` |
| 메뉴 | 햄버거 | `Menu` |
| 검색 | 돋보기 | `Search` |
| 설정 | 톱니바퀴 | `Settings` |
| 사용자 | 사람 | `User` |
| 체크 | 체크마크 | `Check` |
| 경고 | 삼각형 ! | `AlertTriangle` |
| 정보 | 원 i | `Info` |
| 화살표 | 방향별 | `ChevronRight`, `ArrowLeft` |

### 4.2 일관성 규칙

```
동일한 의미 → 동일한 아이콘
예: "닫기"는 항상 X 아이콘 사용
```

---

## 5. 사용 패턴

### 5.1 버튼 내 아이콘

```tsx
// 아이콘 + 텍스트
<Button>
  <Plus className="size-4" />
  추가하기
</Button>

// 텍스트 + 아이콘
<Button>
  자세히 보기
  <ChevronRight className="size-4" />
</Button>

// 아이콘 버튼 (aria-label 필수)
<Button size="icon" aria-label="메뉴 열기">
  <Menu className="size-5" />
</Button>
```

### 5.2 IconBox 컴포넌트

```tsx
// 배경이 있는 아이콘
<IconBox size="lg" variant="default">
  <Zap className="size-6" />
</IconBox>
```

### 5.3 인라인 아이콘

```tsx
<span className="inline-flex items-center gap-1">
  <Info className="size-4 text-muted-foreground" />
  추가 정보
</span>
```

---

## 6. 접근성 요구사항

### 6.1 장식용 아이콘

```tsx
// aria-hidden으로 스크린리더에서 숨김
<Check className="size-4" aria-hidden="true" />
<span>완료</span>
```

### 6.2 의미 있는 아이콘 (단독 사용)

```tsx
// aria-label 필수
<button aria-label="닫기">
  <X className="size-5" />
</button>

// 또는 sr-only 텍스트
<button>
  <X className="size-5" />
  <span className="sr-only">닫기</span>
</button>
```

---

## 7. 규칙

### 7.1 허용

```tsx
✅ lucide-react 아이콘만 사용
✅ 토큰 기반 색상 사용
✅ 정의된 사이즈 체계 사용
✅ 아이콘 버튼에 aria-label 제공
```

### 7.2 금지

```tsx
❌ 다른 아이콘 라이브러리 혼용
❌ 임의 사이즈 (size-[17px])
❌ 하드코딩 색상 (text-[#xxx])
❌ 의미 있는 단독 아이콘에 접근성 미제공
```

---

## 8. 토큰 연결

### IconBox Variants

| Variant | Background | Text |
|---------|------------|------|
| `default` | `bg-primary/10` | `text-primary` |
| `muted` | `bg-muted` | `text-muted-foreground` |
| `outline` | transparent | `text-foreground` + `border` |

---

## 9. 최소 예시

### 기능 카드 아이콘

```tsx
import { Zap, Shield, Rocket } from "lucide-react"
import { IconBox, Card, Heading, Text } from "@/components/ui"

const features = [
  { icon: Zap, title: "빠른 속도", desc: "..." },
  { icon: Shield, title: "보안", desc: "..." },
  { icon: Rocket, title: "성능", desc: "..." },
]

{features.map(({ icon: Icon, title, desc }) => (
  <Card>
    <IconBox size="lg">
      <Icon className="size-6" />
    </IconBox>
    <Heading level={4}>{title}</Heading>
    <Text variant="muted">{desc}</Text>
  </Card>
))}
```

### 상태 아이콘

```tsx
import { Check, X, AlertTriangle, Info } from "lucide-react"

// 성공
<span className="text-green-600"><Check className="size-5" /></span>

// 실패
<span className="text-destructive"><X className="size-5" /></span>

// 경고
<span className="text-yellow-600"><AlertTriangle className="size-5" /></span>

// 정보
<span className="text-blue-600"><Info className="size-5" /></span>
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
