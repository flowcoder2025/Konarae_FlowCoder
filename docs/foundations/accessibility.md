# 접근성 요구사항 (Accessibility)

> **목적**: WCAG 2.1 Level AA 준수를 위한 접근성 기준 정의
> **범위**: 모달, 버튼, 폼, 피드백 등 모든 인터랙티브 컴포넌트
> **원칙**: 모든 인터랙션은 키보드로 접근 가능해야 함

---

## 1. 기본 원칙

| 원칙 | 기준 | 검증 방법 |
|-----|------|----------|
| 색상 대비 | 4.5:1 이상 | Chrome DevTools |
| 키보드 접근 | 모든 인터랙션 가능 | Tab 키로 테스트 |
| 포커스 표시 | 명확한 시각적 표시 | `focus-visible:ring-2` |
| 스크린리더 | 의미 있는 레이블 | `aria-label`, `aria-labelledby` |

---

## 2. 컴포넌트별 요구사항

### 2.1 Button

| 요구사항 | 구현 방법 |
|---------|----------|
| 포커스 표시 | `focus-visible:ring-2 focus-visible:ring-ring` |
| 비활성 상태 | `disabled:opacity-50 disabled:pointer-events-none` |
| 로딩 상태 | `aria-busy="true"` + 스피너 |
| 아이콘 버튼 | `aria-label` 필수 |

```tsx
// 아이콘 버튼 예시
<Button size="icon" aria-label="메뉴 열기">
  <MenuIcon />
</Button>
```

### 2.2 Modal

| 요구사항 | 구현 방법 | 필수 |
|---------|----------|:----:|
| 역할 선언 | `role="dialog"` | ✅ |
| 모달 표시 | `aria-modal="true"` | ✅ |
| 제목 연결 | `aria-labelledby={titleId}` | ✅ |
| 포커스 트랩 | Tab 키 내부 순환 | ✅ |
| ESC 닫기 | `onKeyDown` 핸들러 | ✅ |
| 포커스 복귀 | 닫힐 때 트리거로 복귀 | ✅ |

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <h2 id="modal-title">모달 제목</h2>
  {/* 내용 */}
</div>
```

### 2.3 Form

| 요구사항 | 구현 방법 |
|---------|----------|
| 라벨 연결 | `<label htmlFor={inputId}>` |
| 에러 연결 | `aria-describedby={errorId}` |
| 에러 상태 | `aria-invalid="true"` |
| 필수 필드 | `aria-required="true"` |

```tsx
<div>
  <label htmlFor="email">이메일</label>
  <input
    id="email"
    type="email"
    aria-required="true"
    aria-invalid={hasError}
    aria-describedby={hasError ? "email-error" : undefined}
  />
  {hasError && (
    <span id="email-error" role="alert">
      유효한 이메일을 입력하세요
    </span>
  )}
</div>
```

### 2.4 Feedback (Toast/Alert)

| 요구사항 | 구현 방법 |
|---------|----------|
| 실시간 알림 | `role="alert"` 또는 `aria-live="polite"` |
| 에러 알림 | `role="alert"` (즉시 읽힘) |
| 정보 알림 | `aria-live="polite"` (순서대로) |

---

## 3. 포커스 관리

### 3.1 포커스 순서

```
논리적 순서: 좌→우, 상→하
Tab: 다음 요소로 이동
Shift+Tab: 이전 요소로 이동
```

### 3.2 포커스 트랩 (모달)

```tsx
// 모달 내부에서만 Tab 순환
const focusableElements = modal.querySelectorAll(
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
)
const firstElement = focusableElements[0]
const lastElement = focusableElements[focusableElements.length - 1]

// Tab 키 핸들링
if (e.key === 'Tab') {
  if (e.shiftKey && document.activeElement === firstElement) {
    e.preventDefault()
    lastElement.focus()
  } else if (!e.shiftKey && document.activeElement === lastElement) {
    e.preventDefault()
    firstElement.focus()
  }
}
```

### 3.3 포커스 스타일

```css
/* 기본 포커스 스타일 */
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
```

---

## 4. 키보드 단축키

### 4.1 표준 단축키

| 키 | 동작 |
|----|------|
| Tab | 다음 요소로 이동 |
| Shift+Tab | 이전 요소로 이동 |
| Enter/Space | 버튼 클릭, 체크박스 토글 |
| ESC | 모달/드롭다운 닫기 |
| Arrow Keys | 메뉴/옵션 탐색 |

### 4.2 컴포넌트별 키보드 지원

| 컴포넌트 | Enter | Space | ESC | Arrows |
|---------|:-----:|:-----:|:---:|:------:|
| Button | ✅ | ✅ | - | - |
| Modal | - | - | ✅ | - |
| Select | ✅ | ✅ | ✅ | ✅ |
| Checkbox | - | ✅ | - | - |
| Radio | - | ✅ | - | ✅ |

---

## 5. 스크린리더 지원

### 5.1 ARIA 속성

| 속성 | 용도 |
|-----|------|
| `aria-label` | 요소에 직접 레이블 |
| `aria-labelledby` | 다른 요소의 텍스트 참조 |
| `aria-describedby` | 추가 설명 연결 |
| `aria-hidden` | 스크린리더에서 숨김 |
| `aria-expanded` | 펼침/접힘 상태 |
| `aria-selected` | 선택 상태 |
| `aria-busy` | 로딩 상태 |

### 5.2 시맨틱 HTML 우선

```tsx
// ✅ 시맨틱 HTML
<button>클릭</button>
<nav>...</nav>
<main>...</main>

// ❌ div + role (피해야 함)
<div role="button">클릭</div>
<div role="navigation">...</div>
```

---

## 6. 규칙

### 6.1 필수 (Must)

- 모든 이미지에 `alt` 텍스트
- 모든 폼 입력에 연결된 `label`
- 모달에 포커스 트랩 구현
- 색상만으로 정보 전달 금지 (아이콘/텍스트 병행)

### 6.2 금지 (Must Not)

- `outline: none` 단독 사용 (대체 포커스 스타일 없이)
- `tabindex > 0` 사용
- 자동 재생 미디어 (사용자 제어 없이)
- 3초 이상 깜빡임 효과

---

## 7. 최소 예시

### 접근성 완비 모달

```tsx
function AccessibleModal({ isOpen, onClose, title, children }) {
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // 닫힐 때 포커스 복귀
  useEffect(() => {
    if (!isOpen) triggerRef.current?.focus()
  }, [isOpen])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <button onClick={onClose}>닫기</button>
    </div>
  )
}
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
