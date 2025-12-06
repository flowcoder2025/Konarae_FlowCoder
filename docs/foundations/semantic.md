# UI 의미 레벨 (Semantic)

> **목적**: UI 요소의 의미적 역할 정의 및 일관된 시각적 표현 매핑
> **범위**: 버튼, 메시지, 상태 표시 등 의미를 전달하는 모든 UI 요소
> **원칙**: 의미(Semantic) → 토큰 → 시각적 표현 순서로 결정

---

## 1. 의미 레벨 정의

| Semantic | 의미 | 사용 상황 |
|----------|------|----------|
| `Primary` | 주요 액션 | CTA, 제출, 확인 |
| `Secondary` | 보조 액션 | 취소, 뒤로, 더 보기 |
| `Confirm` | 긍정적 결과 | 성공, 저장 완료 |
| `Danger` | 위험/파괴적 | 삭제, 탈퇴, 경고 |
| `Info` | 정보 제공 | 안내, 설명, 힌트 |
| `Neutral` | 중립적 | 라벨, 상태 표시 |

---

## 2. Semantic → 버튼 Variant 매핑

| Semantic | Button Variant | 사용 빈도 |
|----------|---------------|----------|
| `Primary` | `default` | ⭐⭐⭐ 주사용 |
| `Secondary` | `outline` | ⭐⭐⭐ 주사용 |
| `Danger` | `destructive` | ⭐ 예비 (요청 시) |
| `Neutral` | `ghost` | ⭐ 예비 (요청 시) |

### 버튼 사용 규칙

```
주사용 (기본):
├── Primary → default variant
└── Secondary → outline variant

예비 (사용자 요청 시만):
├── Danger → destructive variant
└── Neutral → ghost variant
```

---

## 3. Semantic → i18n Tone 매핑

| Semantic | Tone Code | 메시지 예시 |
|----------|-----------|-----------|
| `Confirm` | `Confirm` | "저장되었습니다" |
| `Danger` | `Destructive` | "삭제하시겠습니까?" |
| `Info` | `Soft` | "입력해 주세요" |
| `Neutral` | `Neutral` | "총 3개" |

---

## 4. Semantic → 색상 토큰 매핑

| Semantic | Background | Text | Border |
|----------|------------|------|--------|
| `Primary` | `bg-primary` | `text-primary-foreground` | - |
| `Secondary` | `bg-background` | `text-foreground` | `border-border` |
| `Confirm` | `bg-green-100` | `text-green-800` | - |
| `Danger` | `bg-destructive` | `text-white` | - |
| `Info` | `bg-blue-100` | `text-blue-800` | - |
| `Neutral` | `bg-muted` | `text-muted-foreground` | - |

---

## 5. 컴포넌트별 Semantic 적용

### 5.1 Button

| 상황 | Semantic | Variant | 예시 |
|-----|----------|---------|------|
| 제출/저장 | Primary | `default` | "저장하기" |
| 취소/닫기 | Secondary | `outline` | "취소" |
| 삭제/위험 | Danger | `destructive` | "삭제" |
| 네비게이션 | Neutral | `ghost` | "뒤로" |

### 5.2 Badge

| 상황 | Semantic | Variant |
|-----|----------|---------|
| 성공 상태 | Confirm | `success` |
| 경고 상태 | Danger | `error` |
| 정보 | Info | `default` |
| 기본 | Neutral | `secondary` |

### 5.3 Message/Toast

| 상황 | Semantic | 스타일 |
|-----|----------|-------|
| 성공 알림 | Confirm | 초록 배경 + 체크 아이콘 |
| 에러 알림 | Danger | 빨간 배경 + X 아이콘 |
| 정보 알림 | Info | 파란 배경 + i 아이콘 |
| 경고 알림 | Danger | 노란 배경 + ! 아이콘 |

---

## 6. 버튼 조합 패턴

### 6.1 확인 다이얼로그

```
[Secondary: 취소] [Primary: 확인]
     outline         default
```

### 6.2 삭제 확인 다이얼로그

```
[Secondary: 취소] [Danger: 삭제]
     outline       destructive
```

### 6.3 CTA 섹션

```
[Primary: 시작하기] [Secondary: 자세히 보기]
      default            outline
```

---

## 7. 규칙

### 7.1 허용

```tsx
✅ 한 화면에 Primary 버튼 1개 (명확한 주요 액션)
✅ Secondary 버튼으로 대안 제공
✅ Danger는 삭제/위험 상황에만 사용
```

### 7.2 금지

```tsx
❌ Primary 버튼 여러 개 (시선 분산)
❌ Danger를 일반 액션에 사용
❌ Semantic 없이 색상만으로 의미 전달
```

---

## 8. 최소 예시

### 모달 버튼 조합

```tsx
// 일반 확인 모달
<ModalFooter>
  <Button variant="outline" onClick={onClose}>
    {getText("BTN.MODAL.CANCEL")}
  </Button>
  <Button onClick={onConfirm}>
    {getText("BTN.MODAL.CONFIRM")}
  </Button>
</ModalFooter>

// 삭제 확인 모달
<ModalFooter>
  <Button variant="outline" onClick={onClose}>
    {getText("BTN.MODAL.CANCEL")}
  </Button>
  <Button variant="destructive" onClick={onDelete}>
    {getText("BTN.MODAL.DELETE")}
  </Button>
</ModalFooter>
```

### Badge 상태 표시

```tsx
// 성공 상태
<Badge variant="success">완료</Badge>

// 에러 상태
<Badge variant="error">실패</Badge>

// 기본 정보
<Badge>새로운</Badge>
```

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
