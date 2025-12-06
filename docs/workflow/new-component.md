# 새 컴포넌트 추가 프로세스

## 기본 흐름

```
요청 → 설계 요약 → 코드 구현 → 체크리스트 검증
         (3~5줄)        ↓
                   index.ts export
```

> **문서 작성은 사용자 요청 시만**

---

## 1단계: 설계 요약 (응답에 포함)

```markdown
### {ComponentName} 설계
- 역할: {한 줄 설명}
- Variants: {variant1}, {variant2}
- Props: {주요 props}
- 토큰: {사용 토큰}
```

---

## 2단계: 코드 구현

```
/src/components/ui/{name}.tsx
```

### 파일 구조

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const {name}Variants = cva("base-classes", {
  variants: { /* ... */ },
  defaultVariants: { /* ... */ },
})

export interface {Name}Props
  extends React.ComponentProps<"div">,
    VariantProps<typeof {name}Variants> {}

function {Name}({ className, variant, ...props }: {Name}Props) {
  return <div className={cn({name}Variants({ variant }), className)} {...props} />
}

export { {Name}, {name}Variants }
```

---

## 3단계: Export 추가

```tsx
// /src/components/ui/index.ts
export { {Name}, {name}Variants } from "./{name}"
```

---

## 4단계: 체크리스트 검증

해당 컴포넌트 유형의 체크리스트 확인:
- `/docs/checklists/button.md`
- `/docs/checklists/modal.md`
- `/docs/checklists/a11y.md`

---

## 문서 작성 (선택)

> **Feature Batch 완료 후 사용자가 요청할 때만**

요청 시 `/docs/components/{name}.md` 생성:

```markdown
# {Name} 스펙
> 목적: {역할}
> 구현: `/src/components/ui/{name}.tsx`

## Variants
| Variant | 용도 |
|---------|------|
| ... | ... |

## Props
| Prop | Type | Default |
|------|------|---------|
| ... | ... | ... |
```
