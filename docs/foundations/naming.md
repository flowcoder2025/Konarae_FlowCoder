# 네이밍 체계 (Naming Convention)

> **목적**: 프로젝트 전체에서 일관된 ID 체계 유지
> **범위**: 화면, 라벨, 버튼, 모든 식별 가능한 UI 요소

---

## 1. 기본 패턴

```
{TYPE}.{DOMAIN}.{CONTEXT}.{NUMBER}
```

| 세그먼트 | 설명 | 예시 |
|---------|------|------|
| TYPE | 요소 유형 | SID, LID, BTN |
| DOMAIN | 기능 도메인 | AUTH, MODAL, FORM |
| CONTEXT | 세부 컨텍스트 | LOGIN, DELETE, SUBMIT |
| NUMBER | 순번 (3자리) | 001, 002, 003 |

---

## 2. TYPE 정의

### 2.1 SID (Screen ID)
화면/페이지 식별자

| ID | 용도 |
|----|------|
| `SID.AUTH.LOGIN.001` | 로그인 화면 |
| `SID.AUTH.REGISTER.001` | 회원가입 화면 |
| `SID.DASHBOARD.MAIN.001` | 대시보드 메인 |

### 2.2 LID (Label ID)
텍스트 라벨 식별자 (제목, 설명, 안내문)

| ID | 용도 |
|----|------|
| `LID.AUTH.LOGIN.TITLE` | 로그인 제목 |
| `LID.MODAL.DELETE.CONFIRM` | 삭제 확인 메시지 |
| `LID.FORM.EMAIL.PLACEHOLDER` | 이메일 플레이스홀더 |

### 2.3 BTN (Button ID)
버튼 식별자

| ID | 용도 |
|----|------|
| `BTN.PRIMARY.SUBMIT.001` | 제출 버튼 |
| `BTN.SECONDARY.CANCEL.001` | 취소 버튼 |
| `BTN.CTA.START.001` | 시작하기 CTA |

---

## 3. DOMAIN 목록

| DOMAIN | 설명 | 예시 |
|--------|------|------|
| AUTH | 인증 관련 | LOGIN, REGISTER, LOGOUT |
| MODAL | 모달 다이얼로그 | DELETE, CONFIRM, ALERT |
| FORM | 폼 입력 | EMAIL, PASSWORD, NAME |
| NAV | 네비게이션 | HEADER, FOOTER, SIDEBAR |
| DASHBOARD | 대시보드 | MAIN, STATS, SETTINGS |
| COMMON | 공통 | LOADING, ERROR, EMPTY |

---

## 4. 규칙

### 4.1 허용

```
✅ SID.AUTH.LOGIN.001          # 표준 패턴
✅ LID.MODAL.DELETE.TITLE      # 컨텍스트에 TITLE 사용
✅ BTN.PRIMARY.SUBMIT.001      # 시맨틱 타입 포함
```

### 4.2 금지

```
❌ auth_login_001              # snake_case 금지
❌ SID.auth.login.001          # 소문자 금지
❌ SID-AUTH-LOGIN-001          # 하이픈 금지
❌ SIDAUTHLOGIN001             # 구분자 누락 금지
❌ SID.LOGIN.001               # DOMAIN 누락 금지
```

---

## 5. i18n 연결

네이밍 ID는 `text-config.ts`의 키와 직접 연결:

```tsx
// /src/lib/text-config.ts
export const ID_TEXT: Record<string, string> = {
  "LID.AUTH.LOGIN.TITLE": "로그인",
  "BTN.AUTH.LOGIN": "로그인",
  "BTN.PRIMARY.SUBMIT.001": "제출",
}

// 사용
getText("LID.AUTH.LOGIN.TITLE") // "로그인"
```

---

## 6. 최소 예시

### 로그인 화면 네이밍

| 요소 | ID |
|-----|-----|
| 화면 | `SID.AUTH.LOGIN.001` |
| 제목 | `LID.AUTH.LOGIN.TITLE` |
| 부제목 | `LID.AUTH.LOGIN.SUBTITLE` |
| 이메일 라벨 | `LID.AUTH.EMAIL.LABEL` |
| 이메일 플레이스홀더 | `LID.AUTH.EMAIL.PLACEHOLDER` |
| 로그인 버튼 | `BTN.AUTH.LOGIN` |
| 회원가입 버튼 | `BTN.AUTH.REGISTER` |

---

## 변경 이력

| 날짜 | 변경 |
|-----|------|
| 2025-12-05 | 초기 작성 |
