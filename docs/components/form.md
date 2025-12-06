# Form 스펙

> **목적**: 사용자 입력을 수집하는 폼 요소들의 규격 정의
> **범위**: Input, Select, Checkbox, Radio, Textarea 등 모든 폼 요소
> **구현**: `/src/components/ui/input.tsx` 외

---

## 1. 역할

- 사용자로부터 데이터를 수집하는 인터페이스 제공
- 입력 상태에 대한 시각적/텍스트 피드백 제공
- 접근성과 사용성을 보장하는 일관된 패턴

---

## 2. 공통 구조

```
┌─────────────────────────────┐
│ [Label]           [Required]│  ← Label 영역
├─────────────────────────────┤
│ [Input Field]               │  ← Input 영역
├─────────────────────────────┤
│ [Help/Error Text]           │  ← Feedback 영역
└─────────────────────────────┘
```

### 구성 요소

| 요소 | 필수 | 설명 |
|-----|:----:|------|
| Label | ✅ | 입력 필드 설명 |
| Input | ✅ | 실제 입력 요소 |
| Placeholder | 선택 | 입력 힌트 |
| Help Text | 선택 | 추가 안내 |
| Error Text | 조건부 | 에러 메시지 |
| Required Indicator | 조건부 | 필수 표시 (*) |

---

## 3. Input 상태

| 상태 | 트리거 | 스타일 |
|-----|-------|-------|
| `default` | 초기 | `border-input` |
| `focus` | 포커스 | `ring-2 ring-ring` |
| `filled` | 값 있음 | `border-input` |
| `error` | 검증 실패 | `border-destructive` |
| `disabled` | 비활성 | `opacity-50` |
| `readonly` | 읽기 전용 | `bg-muted` |

---

## 4. 검증 상태

### 4.1 에러 표시

```tsx
<div className="space-y-2">
  <Label htmlFor="email">이메일</Label>
  <Input
    id="email"
    aria-invalid={hasError}
    aria-describedby="email-error"
    className={hasError ? "border-destructive" : ""}
  />
  {hasError && (
    <p id="email-error" className="text-sm text-destructive" role="alert">
      유효한 이메일을 입력하세요
    </p>
  )}
</div>
```

### 4.2 성공 표시 (선택적)

```tsx
<div className="space-y-2">
  <Label htmlFor="email">이메일</Label>
  <Input
    id="email"
    className="border-green-500"
  />
  <p className="text-sm text-green-600">
    사용 가능한 이메일입니다
  </p>
</div>
```

---

## 5. 토큰 연결

### 5.1 Color Tokens

| 상태 | Border | Text | Background |
|-----|--------|------|------------|
| Default | `border-input` | `text-foreground` | `bg-background` |
| Focus | `ring-ring` | - | - |
| Error | `border-destructive` | `text-destructive` | - |
| Disabled | `border-input` | `text-muted-foreground` | `bg-muted` |

### 5.2 Size Tokens

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | `h-8` | `px-3 py-1` | `text-xs` |
| `default` | `h-10` | `px-3 py-2` | `text-sm` |
| `lg` | `h-12` | `px-4 py-3` | `text-base` |

---

## 6. 네이밍/i18n 연결

| 요소 | 네이밍 패턴 | 예시 |
|-----|-----------|------|
| Label | `LID.FORM.{FIELD}.LABEL` | `LID.FORM.EMAIL.LABEL` |
| Placeholder | `LID.FORM.{FIELD}.PLACEHOLDER` | `LID.FORM.EMAIL.PLACEHOLDER` |
| Error | `LID.FORM.{FIELD}.ERROR.{TYPE}` | `LID.FORM.EMAIL.ERROR.INVALID` |
| Help | `LID.FORM.{FIELD}.HELP` | `LID.FORM.PASSWORD.HELP` |

---

## 7. 접근성 요구사항

### 7.1 필수 체크리스트

- [x] 모든 Input에 연결된 `<label>`
- [x] 에러 시 `aria-invalid="true"`
- [x] 에러 메시지에 `aria-describedby` 연결
- [x] 필수 필드에 `aria-required="true"`
- [x] 에러 메시지에 `role="alert"`

### 7.2 Label 연결

```tsx
// 방법 1: htmlFor
<label htmlFor="email">이메일</label>
<input id="email" />

// 방법 2: 중첩
<label>
  이메일
  <input />
</label>

// 방법 3: aria-labelledby
<span id="email-label">이메일</span>
<input aria-labelledby="email-label" />
```

---

## 8. 폼 요소별 규칙

### 8.1 Input

```tsx
<Input
  type="email"
  placeholder={getText("LID.FORM.EMAIL.PLACEHOLDER")}
  aria-label={getText("LID.FORM.EMAIL.LABEL")}
/>
```

### 8.2 Select

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">옵션 1</SelectItem>
    <SelectItem value="option2">옵션 2</SelectItem>
  </SelectContent>
</Select>
```

### 8.3 Checkbox

```tsx
<div className="flex items-center space-x-2">
  <Checkbox id="terms" />
  <label htmlFor="terms">약관에 동의합니다</label>
</div>
```

### 8.4 Radio

```tsx
<RadioGroup defaultValue="option1">
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option1" id="r1" />
    <label htmlFor="r1">옵션 1</label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option2" id="r2" />
    <label htmlFor="r2">옵션 2</label>
  </div>
</RadioGroup>
```

---

## 9. 규칙

### 9.1 허용

```tsx
✅ 모든 입력 필드에 Label 제공
✅ 에러 메시지는 명확하고 구체적으로
✅ 실시간 검증보다 제출 시 검증 우선
✅ 선택 필드는 "(선택)" 표시
```

### 9.2 금지

```tsx
❌ Label 없는 입력 필드
❌ Placeholder를 Label 대신 사용
❌ 색상만으로 에러 상태 표시
❌ 모호한 에러 메시지 ("입력이 잘못되었습니다")
```

---

## 10. 최소 예시

### 로그인 폼

```tsx
import { Input, Button, VStack, HStack } from "@/components/ui"
import { getText } from "@/lib/text-config"

function LoginForm() {
  const [errors, setErrors] = useState({})

  return (
    <form>
      <VStack gap={4}>
        {/* Email */}
        <div className="space-y-2 w-full">
          <label htmlFor="email" className="text-sm font-medium">
            {getText("LID.FORM.EMAIL.LABEL")}
          </label>
          <Input
            id="email"
            type="email"
            placeholder={getText("LID.FORM.EMAIL.PLACEHOLDER")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-destructive" role="alert">
              {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2 w-full">
          <label htmlFor="password" className="text-sm font-medium">
            {getText("LID.FORM.PASSWORD.LABEL")}
          </label>
          <Input
            id="password"
            type="password"
            placeholder={getText("LID.FORM.PASSWORD.PLACEHOLDER")}
            aria-invalid={!!errors.password}
          />
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full">
          {getText("BTN.AUTH.LOGIN")}
        </Button>
      </VStack>
    </form>
  )
}
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
