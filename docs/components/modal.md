# Modal 스펙

> **목적**: 사용자의 주의를 집중시키는 오버레이 다이얼로그
> **범위**: 확인, 경고, 폼 입력, 정보 표시 등 컨텍스트 전환이 필요한 상황
> **구현**: `/src/components/ui/modal.tsx` (또는 Dialog)

---

## 1. 역할

- 현재 컨텍스트 위에 새로운 작업 공간 제공
- 사용자의 결정이나 입력을 요구하는 중요한 상황에서 사용
- 배경 컨텐츠와의 상호작용을 일시적으로 차단

---

## 2. 구조

```
┌─────────────────────────────┐
│ [Title]            [Close]  │  ← Header
├─────────────────────────────┤
│                             │
│         [Content]           │  ← Body
│                             │
├─────────────────────────────┤
│    [Cancel]  [Confirm]      │  ← Footer
└─────────────────────────────┘
```

### 구성 요소

| 요소 | 필수 | 설명 |
|-----|:----:|------|
| Overlay | ✅ | 배경 딤 처리 |
| Container | ✅ | 모달 컨테이너 |
| Header | 선택 | 제목 + 닫기 버튼 |
| Title | ✅ | 모달 제목 (접근성 필수) |
| Body | ✅ | 본문 내용 |
| Footer | 선택 | 액션 버튼 영역 |

---

## 3. Props

| Prop | Type | Default | 설명 |
|------|------|---------|------|
| `open` | `boolean` | `false` | 열림 상태 |
| `onOpenChange` | `(open: boolean) => void` | - | 상태 변경 콜백 |
| `title` | `string` | - | 모달 제목 (접근성) |
| `description` | `string` | - | 모달 설명 (선택) |

---

## 4. 상태 머신

```yaml
States: [CLOSED, OPENING, OPEN, CLOSING]

Events:
  - OPEN_MODAL: 모달 열기 요청
  - CLOSE_MODAL: 모달 닫기 요청
  - ANIMATION_END: 애니메이션 완료

Guards:
  - canOpen: "currentState === CLOSED"
  - canClose: "currentState === OPEN"

Transitions:
  CLOSED → OPENING:
    Event: OPEN_MODAL
    Guard: canOpen
    Action: startOpenAnimation

  OPENING → OPEN:
    Event: ANIMATION_END
    Action: trapFocus, announceToSR

  OPEN → CLOSING:
    Event: CLOSE_MODAL
    Guard: canClose
    Action: startCloseAnimation

  CLOSING → CLOSED:
    Event: ANIMATION_END
    Action: restoreFocus, cleanup
```

### Transition 표

| From | Event | Guard | To | Actions |
|------|-------|-------|-----|---------|
| CLOSED | OPEN_MODAL | canOpen | OPENING | startOpenAnimation |
| OPENING | ANIMATION_END | - | OPEN | trapFocus |
| OPEN | CLOSE_MODAL | canClose | CLOSING | startCloseAnimation |
| OPEN | ESC_KEY | - | CLOSING | startCloseAnimation |
| OPEN | OVERLAY_CLICK | - | CLOSING | startCloseAnimation |
| CLOSING | ANIMATION_END | - | CLOSED | restoreFocus |

---

## 5. 토큰 연결

### 5.1 Color Tokens

| 요소 | 토큰 |
|-----|------|
| Overlay | `bg-black/80` |
| Container | `bg-background` |
| Title | `text-foreground` |
| Description | `text-muted-foreground` |
| Border | `border-border` |

### 5.2 Size Tokens

| Size | Width | Padding |
|------|-------|---------|
| `sm` | `max-w-sm` | `p-4` |
| `default` | `max-w-lg` | `p-6` |
| `lg` | `max-w-2xl` | `p-6` |
| `full` | `max-w-[90vw]` | `p-6` |

---

## 6. 네이밍/i18n 연결

| 요소 | 네이밍 패턴 | 예시 |
|-----|-----------|------|
| 제목 | `LID.MODAL.{TYPE}.TITLE` | `LID.MODAL.DELETE.TITLE` |
| 본문 | `LID.MODAL.{TYPE}.BODY` | `LID.MODAL.DELETE.BODY` |
| 확인 | `BTN.MODAL.{ACTION}` | `BTN.MODAL.CONFIRM` |
| 취소 | `BTN.MODAL.CANCEL` | `BTN.MODAL.CANCEL` |

---

## 7. 접근성 요구사항

### 7.1 필수 체크리스트

- [x] `role="dialog"` 선언
- [x] `aria-modal="true"` 선언
- [x] `aria-labelledby` 제목 연결
- [x] 열릴 때 포커스가 모달 내부로 이동
- [x] Tab 키로 모달 내부만 순환 (포커스 트랩)
- [x] ESC 키로 닫기
- [x] 닫힐 때 트리거 요소로 포커스 복귀

### 7.2 구현 예시

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">{title}</h2>
  <p id="modal-description">{description}</p>
</div>
```

---

## 8. 버튼 조합 규칙

### 8.1 일반 확인 모달

```tsx
<ModalFooter>
  <Button variant="outline">취소</Button>
  <Button>확인</Button>
</ModalFooter>
```

### 8.2 삭제 확인 모달

```tsx
<ModalFooter>
  <Button variant="outline">취소</Button>
  <Button variant="destructive">삭제</Button>
</ModalFooter>
```

### 8.3 정보 모달 (닫기만)

```tsx
<ModalFooter>
  <Button>확인</Button>
</ModalFooter>
```

---

## 9. 규칙

### 9.1 허용

```tsx
✅ 사용자 결정이 필요한 중요 상황에서 사용
✅ 제목은 항상 명시적으로 제공
✅ 취소/확인 버튼 조합 사용
```

### 9.2 금지

```tsx
❌ 단순 정보 표시에 모달 남용
❌ 중첩 모달 (모달 위에 모달)
❌ 제목 없는 모달
❌ ESC/오버레이 클릭 닫기 비활성화 (특수 상황 제외)
```

---

## 10. 최소 예시

### 확인 모달

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui"

function ConfirmModal({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {getText("LID.MODAL.CONFIRM.TITLE")}
          </DialogTitle>
          <DialogDescription>
            {getText("LID.MODAL.CONFIRM.BODY")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {getText("BTN.MODAL.CANCEL")}
          </Button>
          <Button onClick={onConfirm}>
            {getText("BTN.MODAL.CONFIRM")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 삭제 확인 모달

```tsx
function DeleteModal({ open, onOpenChange, onDelete, itemName }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {getText("LID.MODAL.DELETE.TITLE")}
          </DialogTitle>
          <DialogDescription>
            "{itemName}"을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {getText("BTN.MODAL.CANCEL")}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {getText("BTN.MODAL.DELETE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
