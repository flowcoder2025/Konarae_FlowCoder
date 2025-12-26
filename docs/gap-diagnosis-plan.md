# 부족항목 진단 시스템 구현 계획서

> **작성일**: 2025-12-26
> **버전**: 1.0.0
> **상태**: 승인됨 - 구현 진행 중

---

## 1. 개요

### 1.1 배경

IR 덱(Konarae_IR_Deck2.html) 분석 결과, 핵심 차별화 기능 4가지 중 2가지가 미구현 상태:

| IR 솔루션 | 구현 상태 | 비고 |
|----------|---------|------|
| 자동 매칭 | ✅ 90% | 핵심 완성 |
| 문서 작성 시스템 | ✅ 80% | 마스터 프로필, 증빙, 블록 문서 |
| **부족항목 진단** | ❌ 0% | **본 계획서 대상** |
| 제출 전 점검 | ⚠️ 20% | 2차 구현 예정 |

### 1.2 목표

- **핵심 차별화 기능 구현**: IR 슬라이드 15 "부족항목 진단" 완전 구현
- **AI 기반 정교한 진단**: Gemini + RAG 활용 90% 정확도 목표
- **크래딧 과금 체계**: 건당 과금으로 수익 모델 기반 마련

### 1.3 결정사항

| 항목 | 결정 | 근거 |
|-----|------|------|
| 우선순위 | 부족항목 진단 먼저 | 핵심 차별화, 제출 전 점검은 이후 |
| 과금 모델 | 크래딧 건당 과금 | 구독 제외, 심플한 시작 |
| AI 수준 | AI 기반 정교 | 4주, 90% 정확도 목표 |
| 데이터 활용 | RAG + 문서 분석 | 유사 합격 사례 + 증빙 자동 분석 |
| 결과 보관 | 무제한 | 사용자 요청 |

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    부족항목 진단 시스템                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Input Layer]                                              │
│  ├─ SupportProject (공고 정보 + 요구사항)                    │
│  ├─ Company (기업 프로필)                                    │
│  └─ CompanyDocument[] (증빙 문서 + 분석 결과)                │
│                                                             │
│  [Processing Layer]                                         │
│  ├─ RequirementExtractor (Gemini: 공고→구조화된 요구사항)    │
│  ├─ ProfileAnalyzer (기업 현황 종합)                         │
│  ├─ RAGContext (유사 합격 사례 검색)                         │
│  └─ GapAnalyzer (Gemini: 요구사항 vs 현황 비교)              │
│                                                             │
│  [Output Layer]                                             │
│  ├─ GapDiagnosis (진단 결과 저장)                            │
│  ├─ GapItem[] (부족 항목 목록)                               │
│  └─ ActionItem[] (개선 액션 목록)                            │
│                                                             │
│  [Credit Layer]                                             │
│  ├─ Credit (잔액 관리)                                       │
│  └─ CreditTransaction (사용 내역)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
사용자: 기업 + 공고 선택
    ↓
크래딧 체크 (잔액 >= 15C?)
    ↓ Yes
크래딧 차감 (-15C) + 트랜잭션 기록
    ↓
GapDiagnosis 생성 (status: processing)
    ↓
[비동기 처리 - QStash]
    ├─ 1. 요구사항 추출 (Gemini)
    ├─ 2. 기업 현황 수집
    ├─ 3. RAG 컨텍스트 검색
    └─ 4. 갭 분석 (Gemini)
    ↓
GapDiagnosis 업데이트 (status: completed)
    ↓
알림 발송 (진단 완료)
```

---

## 3. 데이터 모델

### 3.1 크래딧 시스템

```prisma
// 크래딧 잔액
model Credit {
  id              String   @id @default(cuid())
  userId          String   @unique
  balance         Int      @default(100)  // 신규 가입 시 100C 지급
  totalPurchased  Int      @default(0)    // 누적 구매
  totalUsed       Int      @default(0)    // 누적 사용
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions    CreditTransaction[]

  @@map("credits")
}

// 크래딧 거래 내역
model CreditTransaction {
  id              String   @id @default(cuid())
  creditId        String
  type            String   // 'signup_bonus' | 'purchase' | 'usage' | 'refund'
  amount          Int      // +100 (충전), -15 (사용)
  balanceAfter    Int      // 거래 후 잔액
  description     String   // "부족항목 진단 - 2024 스마트공장 지원사업"
  relatedType     String?  // 'diagnosis' | 'check' | 'generation'
  relatedId       String?  // GapDiagnosis.id 등
  createdAt       DateTime @default(now())

  credit          Credit   @relation(fields: [creditId], references: [id], onDelete: Cascade)

  @@index([creditId])
  @@index([createdAt])
  @@map("credit_transactions")
}
```

### 3.2 부족항목 진단

```prisma
// 진단 결과
model GapDiagnosis {
  id              String   @id @default(cuid())
  companyId       String
  projectId       String
  userId          String   // 요청자

  // 진단 결과
  fitScore        Int?     // 0-100 적합도 점수
  status          String   @default("pending")
                           // pending | processing | completed | failed

  // JSON 필드
  requirements    Json?    // ExtractedRequirement[]
  gaps            Json?    // GapItem[]
  actions         Json?    // ActionItem[]

  // 메타
  creditUsed      Int      @default(15)
  errorMessage    String?

  createdAt       DateTime @default(now())
  completedAt     DateTime?

  company         Company        @relation(fields: [companyId], references: [id])
  project         SupportProject @relation(fields: [projectId], references: [id])
  user            User           @relation(fields: [userId], references: [id])

  @@index([companyId])
  @@index([projectId])
  @@index([userId])
  @@index([status])
  @@map("gap_diagnoses")
}
```

### 3.3 타입 정의

```typescript
// 추출된 요구사항
interface ExtractedRequirement {
  id: string
  category: 'document' | 'certification' | 'financial' | 'history' | 'eligibility' | 'other'
  type: 'required' | 'preferred'
  title: string
  description: string
  evidence?: string  // 필요한 증빙 종류
}

// 부족 항목
interface GapItem {
  id: string
  requirementId: string
  category: 'document' | 'certification' | 'financial' | 'history' | 'eligibility' | 'other'
  severity: 'critical' | 'high' | 'medium' | 'low'
  requirement: string   // 공고 요구사항
  current: string       // 현재 상태
  gap: string           // 부족한 점
  impact: number        // 영향도 0-100
}

// 개선 액션
interface ActionItem {
  id: string
  gapId: string
  priority: number      // 1 = 최우선
  title: string
  description: string
  documentType?: string // CompanyDocument 유형
  estimatedDays?: number
}
```

---

## 4. API 설계

### 4.1 크래딧 API

| Method | Path | 설명 | 인증 |
|--------|------|------|-----|
| GET | `/api/credits` | 잔액 조회 | Required |
| GET | `/api/credits/transactions` | 사용 내역 | Required |
| POST | `/api/credits/purchase` | 크래딧 구매 (향후) | Required |

**GET /api/credits 응답:**
```json
{
  "balance": 85,
  "totalPurchased": 0,
  "totalUsed": 15
}
```

### 4.2 진단 API

| Method | Path | 설명 | 크래딧 |
|--------|------|------|-------|
| GET | `/api/diagnosis` | 진단 목록 | - |
| POST | `/api/diagnosis` | 진단 요청 | -15C |
| GET | `/api/diagnosis/[id]` | 진단 결과 | - |
| POST | `/api/diagnosis/[id]/refresh` | 재진단 | -15C |
| POST | `/api/diagnosis/[id]/actions/[actionId]/todo` | 할 일로 추가 | - |

**POST /api/diagnosis 요청:**
```json
{
  "companyId": "cuid...",
  "projectId": "cuid..."
}
```

**GET /api/diagnosis/[id] 응답:**
```json
{
  "id": "cuid...",
  "status": "completed",
  "fitScore": 72,
  "gaps": [
    {
      "id": "gap_1",
      "category": "history",
      "severity": "critical",
      "requirement": "최근 3년간 매출 실적 3건 이상",
      "current": "1건 등록됨",
      "gap": "2건 추가 필요",
      "impact": 85
    }
  ],
  "actions": [
    {
      "id": "action_1",
      "gapId": "gap_1",
      "priority": 1,
      "title": "매출 실적 증빙 추가",
      "description": "실적증명서 또는 세금계산서 2건 이상 업로드",
      "documentType": "export_performance",
      "estimatedDays": 3
    }
  ],
  "createdAt": "2025-12-26T10:00:00Z",
  "completedAt": "2025-12-26T10:01:30Z"
}
```

---

## 5. AI 프롬프트 설계

### 5.1 요구사항 추출 프롬프트

```
## 역할
당신은 정부 지원사업 공고 분석 전문가입니다.
공고 내용을 분석하여 지원 자격 요건을 구조화해주세요.

## 공고 정보
제목: {project.name}
지원 대상: {project.target}
지원 조건: {project.eligibility}
지역: {project.region}
분야: {project.category}
요약: {project.summary}

## 첨부파일 내용 (있는 경우)
{attachmentContents}

## 분석 지침
1. 필수 요구사항과 우대 요구사항을 구분하세요
2. 각 요구사항에 필요한 증빙 서류를 명시하세요
3. 카테고리별로 분류하세요: document, certification, financial, history, eligibility, other

## 출력 형식 (JSON만 출력)
{
  "requirements": [
    {
      "id": "req_1",
      "category": "certification",
      "type": "required",
      "title": "벤처기업 인증",
      "description": "유효한 벤처기업 확인서 보유 필수",
      "evidence": "벤처기업확인서"
    }
  ]
}
```

### 5.2 갭 분석 프롬프트

```
## 역할
당신은 정부 지원사업 전문 컨설턴트입니다.
기업의 현재 상황과 공고 요구사항을 비교하여 부족한 점을 진단해주세요.

## 공고 요구사항
{requirements}

## 기업 현황
회사명: {company.name}
업종: {company.industry}
설립일: {company.foundedAt}
직원수: {company.employeeCount}
매출액: {company.revenue}
인증현황: {company.certifications}

## 보유 증빙 문서
{documents.map(d => `- ${d.type}: ${d.analysisResult}`)}

## 유사 합격 사례 (참고)
{ragContext}

## 분석 지침
1. 각 요구사항에 대해 충족 여부를 판단하세요
2. 미충족 항목에 대해 구체적인 갭을 설명하세요
3. 심각도를 판정하세요: critical(필수 미충족), high(중요), medium(개선권장), low(우대)
4. 영향도(0-100)를 산정하세요: 합격에 미치는 영향력
5. 개선 액션을 우선순위로 정렬하세요

## 출력 형식 (JSON만 출력)
{
  "fitScore": 72,
  "gaps": [
    {
      "id": "gap_1",
      "requirementId": "req_1",
      "category": "history",
      "severity": "critical",
      "requirement": "최근 3년간 매출 실적 3건 이상",
      "current": "1건 등록됨",
      "gap": "2건 추가 필요",
      "impact": 85
    }
  ],
  "actions": [
    {
      "id": "action_1",
      "gapId": "gap_1",
      "priority": 1,
      "title": "매출 실적 증빙 추가",
      "description": "실적증명서 또는 세금계산서 2건 이상 업로드 필요. 국세청 홈택스에서 발급 가능.",
      "documentType": "export_performance",
      "estimatedDays": 3
    }
  ]
}
```

---

## 6. UI 설계

### 6.1 페이지 구조

```
/(app)/diagnosis/
├── page.tsx                    # 진단 목록
├── new/page.tsx                # 새 진단 요청
│   └── components/
│       ├── CompanySelector.tsx
│       └── ProjectSelector.tsx
└── [id]/
    ├── page.tsx                # 진단 결과 상세
    └── components/
        ├── FitScoreCard.tsx    # 적합도 점수
        ├── GapList.tsx         # 부족 항목 목록
        ├── GapDetail.tsx       # 항목 상세
        └── ActionList.tsx      # 개선 액션
```

### 6.2 진단 결과 화면 (IR 슬라이드 15 기반)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← 진단 결과                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 적합도 ─────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  72점                              부족 항목: 3개         │   │
│  │  ████████████████████░░░░░░░░                            │   │
│  │                                                          │   │
│  │  [진단 업데이트 (15C)]                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ 우선순위 개선 항목 ──────┐  ┌─ 상세 정보 ─────────────────┐ │
│  │                          │  │                             │ │
│  │ 🔴 필수 | 영향도 85       │  │ 📋 최근 3년 실적 증빙 부족   │ │
│  │ 최근 3년 실적 증빙        │  │                             │ │
│  │ ────────────────────── │  │ WHY                         │ │
│  │ 🟡 권장 | 영향도 60       │  │ 공고 요구: 3건 이상          │ │
│  │ 벤처기업 인증서 만료      │  │ 현재 상태: 1건만 등록됨       │ │
│  │ ────────────────────── │  │                             │ │
│  │ 🟢 선호 | 영향도 30       │  │ ──────────────────────── │ │
│  │ ISO 인증 없음            │  │                             │ │
│  │                          │  │ ACTION                      │ │
│  │                          │  │ ☐ 실적증명서 업로드          │ │
│  │                          │  │ ☐ 세금계산서 업로드          │ │
│  │                          │  │                             │ │
│  │                          │  │ 예상 소요: 3일               │ │
│  │                          │  │                             │ │
│  │ [+ 프로젝트 할 일로 추가]  │  │ [문서 업로드하러 가기 →]     │ │
│  └──────────────────────────┘  └─────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 심각도 색상

| Severity | 색상 | Tailwind |
|----------|-----|----------|
| critical | 빨강 | `text-red-600 bg-red-50` |
| high | 주황 | `text-orange-600 bg-orange-50` |
| medium | 노랑 | `text-yellow-600 bg-yellow-50` |
| low | 녹색 | `text-green-600 bg-green-50` |

---

## 7. 구현 일정

### 7.1 Phase 분해

| Phase | 내용 | 기간 | 산출물 |
|-------|-----|------|-------|
| **1** | 데이터 모델 | 3일 | Prisma 스키마, 마이그레이션 |
| **2** | 크래딧 시스템 | 3일 | API, 미들웨어 |
| **3** | 요구사항 추출기 | 4일 | Gemini 연동, 파서 |
| **4** | 갭 분석 엔진 | 5일 | RAG 연동, 분석 로직 |
| **5** | UI 구현 | 4일 | 페이지, 컴포넌트 |
| **6** | 통합 테스트 | 2일 | E2E 테스트 |

**총 기간: 21일 (4주)**

### 7.2 마일스톤

- **M1 (Day 6)**: 크래딧 차감 가능, 진단 요청 생성
- **M2 (Day 15)**: 진단 완료, 결과 조회 가능
- **M3 (Day 19)**: UI 완성, 할 일 연동
- **M4 (Day 21)**: 테스트 완료, 배포 준비

---

## 8. 크래딧 정책

### 8.1 소모량

| 기능 | 크래딧 | 비고 |
|-----|-------|------|
| 부족항목 진단 | 15C | 1회 진단 |
| 진단 업데이트 | 15C | 재진단 |
| (향후) 제출 전 점검 | 20C | 1회 점검 |
| (향후) 사업계획서 생성 | 30C | 전체 생성 |

### 8.2 지급 정책

| 이벤트 | 크래딧 | 비고 |
|-------|-------|------|
| 신규 가입 | +100C | 자동 지급 |
| (향후) 구매 | +NC | 결제 후 |

### 8.3 환불 정책

- 진단 실패(API 오류) 시: 자동 환불 (+15C)
- 사용자 취소: 환불 불가 (처리 시작 후)

---

## 9. 성공 지표

### 9.1 KPI

| 지표 | 목표 | 측정 방법 |
|-----|-----|----------|
| 진단 완료율 | 95% | completed / total |
| 평균 처리 시간 | < 60초 | completedAt - createdAt |
| 사용자 만족도 | 4.0/5.0 | (향후) 피드백 |
| 크래딧 전환율 | 30% | 구매자 / 무료 소진자 |

### 9.2 North Star (IR 기준)

- **주간 제출 완료 기업 수 600개** 달성을 위한 핵심 기능
- 진단 → 보완 → 제출 워크플로우 완성

---

## 10. 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|-----|-----|------|
| Gemini API 응답 지연 | 중 | 중 | QStash 비동기 + 타임아웃 설정 |
| 공고 구조 다양성 | 높 | 중 | 폴백 템플릿 + 점진적 개선 |
| 크래딧 부정 사용 | 낮 | 높 | Rate limiting + 모니터링 |
| RAG 컨텍스트 부족 | 중 | 중 | 기본 분석으로 폴백 |

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|-----|------|----------|
| 2025-12-26 | 1.0.0 | 초기 작성 |
