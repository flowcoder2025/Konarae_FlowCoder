# 루트 가이드 (헌법)

> **프로젝트 정보**: `/docs/prd.md` 또는 `/docs/PRD.md` 참조
> 프로젝트명, 목적, 범위는 PRD 문서에서 정의됩니다.
>
> **역할**: 전역 원칙 + 네비게이터
> **하위 claude.md**: 각 디렉토리의 개별 기능 가이드

---

## 1. 프로젝트 컨텍스트

> ⚠️ **필수**: 작업 시작 전 `/docs/prd.md`를 먼저 읽어 프로젝트 정보를 파악하세요.

| 항목 | 참조 위치 |
|-----|----------|
| 프로젝트명 | `/docs/prd.md` → 프로젝트명 섹션 |
| 목적 | `/docs/prd.md` → 목적 섹션 |
| 범위 | `/docs/prd.md` → 범위/스코프 섹션 |
| 대상 사용자 | `/docs/prd.md` → 타겟 유저 섹션 |

### 1.1 이 Skill의 핵심 가치

**"Primary Color만 바꾸면 브랜드 완성"**

- 디자인 토큰 기반 일관된 UI 시스템
- 자연어 요청 시 정의된 룰에 따라 완성형 UI 생성
- 프로젝트 독립적 재사용 가능한 구조

---

## 2. 기술 스택

| 영역 | 기술 |
|-----|------|
| Framework | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (new-york) |
| Database | Supabase PostgreSQL + Prisma ORM |
| Auth | NextAuth.js + ReBAC 권한 시스템 |
| Deploy | Vercel |

**참조 스킬**: `fdp-backend-architect` (백엔드 아키텍처)

---

## 3. 디렉토리 구조 & 네비게이션

```
/{project_root}
├── claude.md                    # [현재 파일] 루트 헌법
│
├── /src
│   ├── /app                     # Next.js App Router
│   │   └── globals.css          # 디자인 토큰 정의
│   │
│   ├── /components              # UI 컴포넌트
│   │   ├── claude.md            # → 컴포넌트 가이드
│   │   └── /ui
│   │
│   ├── /features                # 기능 모듈
│   │   └── claude.md            # → 기능 개발 가이드
│   │
│   ├── /lib                     # 유틸리티 & 백엔드
│   │   └── claude.md            # → 백엔드/권한 가이드
│   │
│   └── /hooks
│
├── /prisma
│   └── schema.prisma            # DB 스키마
│
├── /docs                        # 상세 스펙 (SSOT) - 자동 생성 금지
│   ├── README.md                # docs 사용 가이드
│   ├── /architecture            # 📌 시스템 개요 (1장 요약)
│   ├── /foundations             # 전역 규칙 (naming, tokens, i18n, a11y)
│   ├── /components              # 컴포넌트 스펙 (필요 시만)
│   ├── /checklists              # 품질 검증 리스트 (간결)
│   └── /changes                 # 변경 이력
│
└── /tests
```

---

## 4. 전역 원칙 (변경 금지)

### 4.1 디자인 토큰 원칙

> **"Primary Color만 바꾸면 전역 반영"**

```css
:root {
  --primary: hsl(168 64% 50%);   /* 이 값만 변경 → 브랜드 변경 */
  --primary-foreground: hsl(0 0% 100%);
}
```

- 모든 색상은 CSS Variables 참조
- 하드코딩된 색상 사용 **금지** (`bg-[#xxx]` 금지)

### 4.2 버튼 전역 제한

#### 주사용 버튼 (Primary Use)

| Variant | 용도 | 사용 빈도 |
|---------|------|----------|
| `default` | Primary 액션 (CTA) | ⭐⭐⭐ 매우 높음 |
| `outline` | Secondary 액션 | ⭐⭐⭐ 매우 높음 |

#### 예비 버튼 (Reserved - 사용자 승인 시)

| Variant | 용도 | 사용 조건 |
|---------|------|----------|
| `destructive` | 위험 액션 (삭제 등) | 사용자 명시적 요청 시 |
| `ghost` | 최소 강조 | 사용자 명시적 요청 시 |

**규칙**:
- 기본적으로 `default` + `outline`만 사용
- 예비 버튼은 사용자가 요청할 때만 적용
- **버튼 variant 추가 확장 금지**
- 하위 claude.md에서 재정의 금지

### 4.3 네이밍 체계

```
{TYPE}.{DOMAIN}.{CONTEXT}.{NUMBER}
```

| TYPE | 용도 | 예시 |
|------|------|------|
| SID | Screen ID | `SID.AUTH.LOGIN.001` |
| LID | Label ID | `LID.MODAL.DELETE.001` |
| BTN | Button ID | `BTN.PRIMARY.SUBMIT.001` |

### 4.4 i18n 원칙

- 모든 UI 텍스트는 `text-config.ts`에서 관리
- 컴포넌트 내 하드코딩 한글 **금지**
- 톤 코드 체계:

| 톤 코드 | 용도 | 예시 |
|--------|------|------|
| `Confirm` | 긍정적 확인 | "저장되었습니다" |
| `Destructive` | 파괴적/위험 | "삭제하시겠습니까?" |
| `Soft` | 부드러운 안내 | "입력해 주세요" |
| `Neutral` | 중립적 정보 | "총 3개" |

### 4.5 접근성 (a11y)

**기본 원칙**:
- **WCAG 2.1 Level AA** 준수
- 색상 대비 4.5:1 이상
- 모든 인터랙션 키보드 접근 가능

**모달 접근성 필수 요구사항**:
- 열릴 때 포커스가 모달 내부로 이동
- Tab 키로 모달 내부만 순환 (포커스 트랩)
- ESC 키로 닫기
- 닫힐 때 트리거 요소로 포커스 복귀
- `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` 또는 `aria-label` 필수

**상태도 작성 규칙 (State Machine)**:
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
  CLOSED → OPENING: Event=OPEN_MODAL, Guard=canOpen
  OPENING → OPEN: Event=ANIMATION_END
  OPEN → CLOSING: Event=CLOSE_MODAL, Guard=canClose
  CLOSING → CLOSED: Event=ANIMATION_END
```

---

## 5. 개발 프로세스

### 5.1 워터폴 (스펙 선행)

```
요구사항 → 네이밍 → 토큰 → 컴포넌트 → 상태도 → i18n → 구현
```

### 5.2 애자일 (Feature Batch)

- 배치 크기: 연관 화면 1~3개 / 2~5일 분량
- 완료 기준: 동작 확인 + 에러 없음

---

## 6. 응답 & 문서 정책 (토큰 효율)

### 6.1 핵심 원칙 (필수 준수)

```
1. 문서(/docs)는 자동으로 생성/갱신하지 않는다
2. 문서 업데이트는 사용자가 명시적으로 요청할 때만 수행
3. 문서 업데이트 시 전체 재작성 금지, 변경된 범위의 델타만 기록
4. 구현은 Feature Batch 단위, 문서 정리는 배치 종료 후 선택
5. 응답 형식: (1) 설계 요약 → (2) 코드, 상세 문서는 요청 시만
```

### 6.2 응답 기본 형식

```
✅ 기본 응답: 설계 요약 (3~5줄) + 코드
❌ 금지: 매 요청마다 문서 자동 생성
```

### 6.3 문서 업데이트 트리거

| 상황 | 문서 작업 |
|-----|----------|
| 코딩 요청 | ❌ 문서 작성 안함 |
| Feature Batch 완료 | ⏳ 사용자 요청 시만 |
| "문서 업데이트해줘" | ✅ 델타만 업데이트 |
| 새 컴포넌트 추가 | 📋 체크리스트로 검증 |

### 6.4 델타 업데이트 규칙

- 전체 문서 재작성 **금지**
- 추가/수정된 섹션만 업데이트
- `/docs/changes/changelog.md`에 변경 기록

---

## 7. 충돌 해결

### 7.1 우선순위

1. **루트 claude.md** (이 파일)
2. 하위 claude.md
3. /docs 상세 스펙

### 7.2 하위 claude.md 제약

- 전역 원칙 재정의 **금지**
- 버튼 variant 확장 **금지**
- 토큰 네이밍 변경 **금지**

---

## 8. 작업 마무리 프로세스

### 8.1 필수 단계

1. **최종 피드백 확인**: 마무리 전 사용자에게 피드백 요청
2. **문서 업데이트**: 변경사항 발생 시 관련 `claude.md` 파일 먼저 수정
3. **품질 검증**: 타입체크 + 빌드테스트 실행
4. **버전 관리**: 커밋 + 푸쉬

### 8.2 검증 명령어

```bash
npx tsc --noEmit      # 타입체크
npm run build         # 빌드테스트
git add . && git commit -m "feat: 작업 내용" && git push
```

### 8.3 프로세스 순서

```
작업 완료 → 피드백 요청 → claude.md 업데이트 → 타입체크 → 빌드 → 커밋 → 푸쉬
```

---

## 변경 이력

| 날짜 | 버전 | 변경 |
|-----|------|------|
| 2025-12-05 | 1.0.0 | 초기 생성 |
| 2025-12-05 | 1.1.0 | 계층 분리 (헌법만 유지) |
| 2025-12-05 | 2.0.0 | PRD 참조 방식 + 버튼 규칙 명확화 + 접근성 강화 |
| 2025-12-05 | 2.1.0 | 토큰 효율 원칙 추가 + /docs 구조 개선 |
