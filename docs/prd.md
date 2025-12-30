# FlowMate - Product Requirements Document (PRD)

## 1. Executive Summary

### 1.1 Product Vision
정부 지원사업 매칭 및 사업계획서 자동화 플랫폼으로, 중소기업과 스타트업이 적합한 지원사업을 찾고 AI 기반 사업계획서를 작성할 수 있도록 지원합니다.

### 1.2 Core Value Proposition
- **시간 절약**: 수백 개의 지원사업 중 기업에 맞는 사업을 자동 매칭
- **품질 향상**: AI 기반 사업계획서 초안 작성 및 평가 피드백
- **접근성 향상**: 복잡한 정부 지원사업 정보를 쉽게 이해할 수 있도록 요약

### 1.3 Target Users
- **Primary**: 중소기업 대표, 스타트업 창업자
- **Secondary**: 기업 경영지원팀, 정부지원사업 컨설턴트

---

## 2. Product Overview

### 2.1 Core Features (4 Main Pages)

#### Feature 1: 지원사업 크롤링 & 정보 요약
- 정부기관 포털 자동 크롤링 (K-Startup, 테크노파크, 소상공인24 등)
- HWP/HWPX/PDF 문서 자동 변환 및 파싱
- AI 기반 지원사업 정보 요약 및 구조화
- 실시간 업데이트 및 마감일 알림

#### Feature 2: 기업-지원사업 매칭
- 다차원 매칭 알고리즘 (semantic + rule-based)
- 기업 프로필 기반 적합도 점수 산출
- 개인화된 추천 및 매칭 이유 설명
- 매칭 선호도 학습 및 개선

#### Feature 3: AI 사업계획서 초안 작성
- 지원사업별 맞춤형 사업계획서 생성
- 기업 프로필 + 지원사업 + 신규 사업 내용 통합
- 섹션별 AI 생성 및 사용자 편집
- 다양한 포맷 내보내기 (PDF, DOCX, HWP)

#### Feature 4: 사업계획서 평가 피드백
- 지원사업 평가 기준에 따른 자동 평가
- 항목별 점수 및 상세 피드백
- 구체적인 개선 제안
- 업로드된 기존 문서도 평가 지원

### 2.2 Sub Features

#### 다수 기업 등록
- 사용자당 여러 기업 프로필 관리
- 기업별 멤버 권한 관리 (owner/admin/member/viewer)
- 기업간 전환 기능

#### 알림 연동
- Discord Webhook 알림
- Slack Webhook 알림
- Resend 이메일 발송
- 알림 유형별 설정 (마감임박, 매칭결과, 평가완료)

### 2.3 Excluded Features
- 커뮤니티 기능 (기존 프로젝트에서 제외)

---

## 3. Technical Architecture

### 3.1 Technology Stack

#### Frontend
| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 15.x |
| React | React | 19.x |
| State Management | TanStack Query | 5.x |
| UI Components | shadcn/ui + Radix UI | Latest |
| Styling | Tailwind CSS | 4.x |
| Forms | React Hook Form + Zod | Latest |

#### Backend (FDP Architecture)
| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | Supabase PostgreSQL | Primary data store |
| ORM | Prisma | Type-safe database access |
| Auth | NextAuth.js v5 | Authentication |
| Adapter | @next-auth/prisma-adapter | Auth-DB integration |
| Permissions | ReBAC | Relationship-based access control |
| Vector Search | pgvector | Semantic similarity search |
| Cache | Upstash Redis | API caching, rate limiting |

#### External Services
| Service | Provider | Purpose |
|---------|----------|---------|
| AI | Google Gemini 2.5 | Text generation, analysis |
| Email | Resend | Transactional emails |
| Notifications | Discord/Slack Webhooks | Real-time alerts |
| Storage | Supabase Storage | File storage |
| Document Parsing | Railway Microservices | HWP/PDF conversion |

### 3.2 Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Next.js Application                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ App      │  │ API      │  │ Edge Functions   │  │   │
│  │  │ Router   │  │ Routes   │  │                  │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Supabase     │  │  Upstash Redis  │  │    Railway      │
│  ┌───────────┐  │  │                 │  │  Microservices  │
│  │PostgreSQL │  │  │  - API Cache    │  │  ┌───────────┐  │
│  │ + pgvector│  │  │  - Rate Limit   │  │  │HWP Parser │  │
│  └───────────┘  │  │  - Sessions     │  │  │PDF Parser │  │
│  ┌───────────┐  │  │                 │  │  │Crawler    │  │
│  │ Storage   │  │  └─────────────────┘  │  │AI Worker  │  │
│  └───────────┘  │                       │  └───────────┘  │
└─────────────────┘                       └─────────────────┘
```

### 3.3 Database Schema (Prisma)

#### Core Tables (FDP Standard)
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts      Account[]
  sessions      Session[]
  companies     CompanyMember[]
  businessPlans BusinessPlan[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

#### Permission Tables (ReBAC)
```prisma
model RelationTuple {
  id          String   @id @default(cuid())
  namespace   String   // e.g., "company", "business_plan"
  objectId    String   // resource ID
  relation    String   // e.g., "owner", "editor", "viewer"
  subjectType String   // "user" or "group"
  subjectId   String   // user or group ID
  createdAt   DateTime @default(now())

  @@unique([namespace, objectId, relation, subjectType, subjectId])
  @@index([namespace, objectId])
  @@index([subjectType, subjectId])
}

model RelationDefinition {
  id         String   @id @default(cuid())
  namespace  String
  relation   String
  inherits   String[] // relations this relation inherits from

  @@unique([namespace, relation])
}
```

#### Domain Tables
```prisma
model Company {
  id                 String   @id @default(cuid())
  name               String
  businessNumber     String   @unique
  corporationNumber  String?
  representativeName String
  establishedDate    DateTime
  companyType        String

  // Business Info
  businessCategory   String?
  mainBusiness       String?
  businessItems      String[]

  // Contact
  phone              String
  fax                String?
  email              String
  website            String?

  // Address
  zipcode            String?
  address            String
  addressDetail      String?

  // Scale
  employeeCount      Int?
  capitalAmount      BigInt?
  annualRevenue      BigInt?
  companySize        String?

  // Certifications
  isVenture          Boolean  @default(false)
  isInnoBiz          Boolean  @default(false)
  isMainBiz          Boolean  @default(false)
  isSocial           Boolean  @default(false)
  isWomen            Boolean  @default(false)
  isDisabled         Boolean  @default(false)

  // Content
  introduction       String?  @db.Text
  vision             String?
  mission            String?
  coreValues         String[]

  // Media
  logoUrl            String?
  bannerUrl          String?

  // Status
  isPublic           Boolean  @default(false)
  isVerified         Boolean  @default(false)
  verifiedAt         DateTime?

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  deletedAt          DateTime?

  members            CompanyMember[]
  financials         CompanyFinancial[]
  certifications     CompanyCertification[]
  achievements       CompanyAchievement[]
  matchingResults    MatchingResult[]
  businessPlans      BusinessPlan[]
}

model CompanyMember {
  id        String   @id @default(cuid())
  companyId String
  userId    String
  role      String   // owner, admin, member, viewer
  invitedAt DateTime @default(now())
  joinedAt  DateTime?

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([companyId, userId])
}

model CompanyFinancial {
  id               String   @id @default(cuid())
  companyId        String
  fiscalYear       Int
  revenue          BigInt?
  operatingProfit  BigInt?
  netProfit        BigInt?
  totalAssets      BigInt?
  totalLiabilities BigInt?
  equity           BigInt?
  creditRating     String?
  ratingAgency     String?
  ratingDate       DateTime?
  notes            String?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  company          Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, fiscalYear])
}

model CompanyCertification {
  id                  String    @id @default(cuid())
  companyId           String
  certificationType   String
  certificationName   String
  issuingOrganization String
  certificationNumber String?
  issueDate           DateTime
  expiryDate          DateTime?
  fileUrl             String?
  isActive            Boolean   @default(true)

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  company             Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
}

model CompanyAchievement {
  id              String   @id @default(cuid())
  companyId       String
  achievementType String   // award, patent, certification, contract, investment
  title           String
  description     String?  @db.Text
  organization    String?
  achievementDate DateTime
  fileUrl         String?
  linkUrl         String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
}

model SupportProject {
  id                  String   @id @default(cuid())
  externalId          String?  @unique
  name                String
  organization        String
  category            String
  subCategory         String?
  target              String
  region              String

  // Amount
  amountMin           BigInt?
  amountMax           BigInt?
  amountDescription   String?

  // Timeline
  startDate           DateTime?
  endDate             DateTime?
  deadline            DateTime?
  isPermanent         Boolean  @default(false)

  // Content
  summary             String   @db.Text
  description         String?  @db.Text
  eligibility         String?  @db.Text
  applicationProcess  String?  @db.Text
  evaluationCriteria  String?  @db.Text
  requiredDocuments   String[]
  contactInfo         String?
  websiteUrl          String?

  // Files
  originalFileUrl     String?
  originalFileType    String?  // hwp, hwpx, pdf

  // Status
  status              String   @default("active") // draft, active, closed
  viewCount           Int      @default(0)
  bookmarkCount       Int      @default(0)

  // Metadata
  crawledAt           DateTime?
  sourceUrl           String?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  embeddings          SupportProjectEmbedding[]
  matchingResults     MatchingResult[]
  businessPlans       BusinessPlan[]
}

model SupportProjectEmbedding {
  id           String   @id @default(cuid())
  projectId    String
  fieldType    String   // combined, name, description, eligibility
  embedding    Unsupported("vector(768)")

  createdAt    DateTime @default(now())

  project      SupportProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, fieldType])
}

model CrawlJob {
  id          String   @id @default(cuid())
  sourceId    String
  status      String   @default("pending") // pending, running, completed, failed
  startedAt   DateTime?
  completedAt DateTime?
  errorMessage String?
  projectsFound Int     @default(0)
  projectsNew   Int     @default(0)
  projectsUpdated Int   @default(0)

  createdAt   DateTime @default(now())

  source      CrawlSource @relation(fields: [sourceId], references: [id])
}

model CrawlSource {
  id          String   @id @default(cuid())
  name        String
  url         String   @unique
  type        String   // api, web
  schedule    String?  // cron expression
  isActive    Boolean  @default(true)
  lastCrawled DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  jobs        CrawlJob[]
}

model MatchingResult {
  id            String   @id @default(cuid())
  userId        String
  companyId     String
  projectId     String

  // Scores
  totalScore    Int
  semanticScore Int
  categoryScore Int
  eligibilityScore Int
  timelinessScore Int
  amountScore   Int

  // Details
  confidence    String   // high, medium, low
  matchReasons  String[]

  // User Feedback
  isRelevant    Boolean?
  feedbackNote  String?

  createdAt     DateTime @default(now())

  company       Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  project       SupportProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([companyId, projectId])
}

model MatchingPreference {
  id             String   @id @default(cuid())
  userId         String
  companyId      String

  categories     String[]
  minAmount      BigInt?
  maxAmount      BigInt?
  regions        String[]
  excludeKeywords String[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([userId, companyId])
}

model BusinessPlan {
  id           String   @id @default(cuid())
  userId       String
  companyId    String
  projectId    String?

  title        String
  status       String   @default("draft") // draft, in_progress, completed, submitted
  templateId   String?

  // Additional Context
  newBusinessDescription String? @db.Text
  additionalNotes        String? @db.Text

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  user         User     @relation(fields: [userId], references: [id])
  company      Company  @relation(fields: [companyId], references: [id])
  project      SupportProject? @relation(fields: [projectId], references: [id])

  sections     BusinessPlanSection[]
  evaluations  Evaluation[]
}

model BusinessPlanSection {
  id             String   @id @default(cuid())
  businessPlanId String

  sectionIndex   Int
  title          String
  content        String   @db.Text
  isAiGenerated  Boolean  @default(false)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  businessPlan   BusinessPlan @relation(fields: [businessPlanId], references: [id], onDelete: Cascade)

  @@unique([businessPlanId, sectionIndex])
}

model Evaluation {
  id             String   @id @default(cuid())
  businessPlanId String?
  uploadedFileUrl String?

  // Overall
  totalScore     Int?
  summary        String?  @db.Text

  // Status
  status         String   @default("pending") // pending, processing, completed, failed
  errorMessage   String?

  createdAt      DateTime @default(now())
  completedAt    DateTime?

  businessPlan   BusinessPlan? @relation(fields: [businessPlanId], references: [id])

  feedbacks      EvaluationFeedback[]
}

model EvaluationFeedback {
  id           String   @id @default(cuid())
  evaluationId String

  criteriaName String
  score        Int?
  maxScore     Int?
  strengths    String[]
  weaknesses   String[]
  suggestions  String[]

  createdAt    DateTime @default(now())

  evaluation   Evaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
}

model Notification {
  id          String   @id @default(cuid())
  userId      String
  type        String   // deadline_alert, matching_result, evaluation_complete
  title       String
  message     String
  data        Json?
  isRead      Boolean  @default(false)

  createdAt   DateTime @default(now())
  readAt      DateTime?

  @@index([userId, isRead])
}

model NotificationSetting {
  id               String   @id @default(cuid())
  userId           String   @unique

  // Channels
  emailEnabled     Boolean  @default(true)
  discordEnabled   Boolean  @default(false)
  slackEnabled     Boolean  @default(false)

  // Webhooks
  discordWebhookUrl String?
  slackWebhookUrl   String?

  // Types
  deadlineAlertDays Int     @default(7)
  matchingResultEnabled Boolean @default(true)
  evaluationCompleteEnabled Boolean @default(true)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

---

## 4. API Specification

### 4.1 Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth.js handler |
| GET | `/api/auth/session` | Get current session |
| POST | `/api/auth/logout` | Logout |

### 4.2 Company APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/companies` | authenticated | List user's companies |
| POST | `/api/companies` | authenticated | Create company |
| GET | `/api/companies/:id` | member+ | Get company details |
| PATCH | `/api/companies/:id` | admin+ | Update company |
| DELETE | `/api/companies/:id` | owner | Delete company |
| POST | `/api/companies/:id/members` | admin+ | Invite member |
| DELETE | `/api/companies/:id/members/:userId` | admin+ | Remove member |
| GET | `/api/companies/:id/financials` | member+ | List financials |
| POST | `/api/companies/:id/financials` | admin+ | Add financial |
| GET | `/api/companies/:id/certifications` | member+ | List certifications |
| POST | `/api/companies/:id/certifications` | admin+ | Add certification |

### 4.3 Support Project APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/projects` | authenticated | List projects (filtered) |
| GET | `/api/projects/:id` | authenticated | Get project details |
| GET | `/api/projects/search` | authenticated | Search projects |
| GET | `/api/projects/recommended` | authenticated | Get AI recommendations |

### 4.4 Matching APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/api/matching` | authenticated | Execute matching |
| GET | `/api/matching/results` | authenticated | List matching results |
| GET | `/api/matching/results/:id` | authenticated | Get result details |
| POST | `/api/matching/results/:id/feedback` | authenticated | Submit feedback |
| GET | `/api/matching/preferences` | authenticated | Get preferences |
| POST | `/api/matching/preferences` | authenticated | Save preferences |

### 4.5 Business Plan APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/business-plans` | authenticated | List business plans |
| POST | `/api/business-plans` | authenticated | Create business plan |
| GET | `/api/business-plans/:id` | viewer+ | Get business plan |
| PATCH | `/api/business-plans/:id` | editor+ | Update business plan |
| DELETE | `/api/business-plans/:id` | owner | Delete business plan |
| POST | `/api/business-plans/:id/generate` | editor+ | AI generate section |
| POST | `/api/business-plans/:id/export` | viewer+ | Export to file |
| POST | `/api/business-plans/:id/share` | owner | Share with user |

### 4.6 Evaluation APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/evaluations` | authenticated | List evaluations |
| POST | `/api/evaluations` | authenticated | Request evaluation |
| GET | `/api/evaluations/:id` | owner | Get evaluation |
| POST | `/api/evaluations/upload` | authenticated | Upload & evaluate |

### 4.7 Notification APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/notifications` | authenticated | List notifications |
| PATCH | `/api/notifications/:id/read` | authenticated | Mark as read |
| GET | `/api/notifications/settings` | authenticated | Get settings |
| PATCH | `/api/notifications/settings` | authenticated | Update settings |
| POST | `/api/notifications/test` | authenticated | Test notification |

### 4.8 RAG APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/api/rag/embed` | authenticated | Generate embeddings for content |
| POST | `/api/rag/search` | authenticated | Hybrid search (semantic + keyword) |
| GET | `/api/rag/embeddings/:sourceType/:sourceId` | authenticated | Get embeddings for source |
| DELETE | `/api/rag/embeddings/:sourceType/:sourceId` | admin+ | Delete embeddings |
| POST | `/api/rag/reindex` | admin | Reindex all documents |

### 4.9 Admin APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/admin/crawler/jobs` | admin | List crawl jobs |
| POST | `/api/admin/crawler/start` | admin | Start crawl |
| GET | `/api/admin/projects` | admin | Manage projects |
| GET | `/api/admin/users` | admin | Manage users |

---

## 5. Page Structure

### 5.1 Public Pages
```
/                    Landing page
/login               Login
/signup              Sign up
/pricing             Pricing plans
```

### 5.2 Protected Pages
```
/dashboard           Main dashboard

/companies           Company list
/companies/new       Register company
/companies/:id       Company details/edit
/companies/:id/financials     Financial info
/companies/:id/certifications Certification info
/companies/:id/members        Member management

/projects            Project list (filtered, searched)
/projects/:id        Project details
/projects/recommended AI recommendations

/matching            Matching dashboard
/matching/new        New matching
/matching/results    Results list
/matching/results/:id Result details

/business-plans      Business plan list
/business-plans/new  Create new plan
/business-plans/:id  Edit plan
/business-plans/:id/preview Preview
/business-plans/:id/export  Export

/evaluations         Evaluation list
/evaluations/new     New evaluation
/evaluations/:id     Evaluation details

/settings            Settings main
/settings/profile    Profile
/settings/notifications Notifications
/settings/integrations  Discord/Slack
/settings/billing    Billing
```

### 5.3 Admin Pages
```
/admin               Admin dashboard
/admin/crawler       Crawler management
/admin/projects      Project management
/admin/users         User management
```

---

## 6. AI Pipeline Architecture

### 6.1 Document Processing Pipeline
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Crawl Job   │────▶│  File Parse  │────▶│  AI Summary  │
│  (Puppeteer) │     │  (HWP/PDF)   │     │  (Gemini)    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   Database   │◀────│  Embedding   │
                     │   (Prisma)   │     │  (pgvector)  │
                     └──────────────┘     └──────────────┘
```

### 6.2 Matching Algorithm
```typescript
interface MatchingWeights {
  semantic: 0.35,      // Vector similarity (pgvector)
  category: 0.20,      // Category match
  eligibility: 0.20,   // Eligibility criteria
  timeliness: 0.15,    // Deadline proximity
  amount: 0.10         // Amount range fit
}
```

### 6.3 AI Model Selection
| Task | Model | Reason |
|------|-------|--------|
| Quick extraction | gemini-2.5-flash-lite | Fast, cost-effective |
| Complex generation | gemini-2.5-pro | High quality output |
| Document analysis | gemini-2.5-pro | Deep understanding |
| Chat/Summary | gemini-2.5-flash-lite | Low latency |

---

## 7. Permission System (ReBAC)

### 7.1 Namespace Definitions
```typescript
const permissions = {
  company: {
    owner: ['admin', 'member', 'viewer'],  // inherits all
    admin: ['member', 'viewer'],
    member: ['viewer'],
    viewer: []
  },
  business_plan: {
    owner: ['editor', 'viewer'],
    editor: ['viewer'],
    viewer: []
  },
  matching_result: {
    owner: ['viewer'],
    viewer: []
  }
}
```

### 7.2 Permission Check Flow
```typescript
// Check if user can edit business plan
const canEdit = await check(userId, 'business_plan', planId, 'editor')
// Returns true if user is owner or editor

// Grant viewer permission when sharing
await grant('business_plan', planId, 'viewer', 'user', collaboratorId)

// Revoke permission
await revoke('business_plan', planId, 'viewer', 'user', collaboratorId)
```

---

## 8. Development Phases

### Phase 1: Infrastructure Setup
- Initialize Next.js 15 project
- Setup Prisma with Supabase
- Configure NextAuth.js
- Implement ReBAC permission system
- Setup basic UI with shadcn/ui

### Phase 2: Company Management
- Company CRUD operations
- Member invitation/management
- Financial/Certification info
- Company switching

### Phase 3: Support Projects
- Railway crawler integration
- HWP/PDF parser services
- Project list/search
- Vector embedding storage

### Phase 4: Matching System
- Matching algorithm implementation
- Preference management
- Result storage/display
- Feedback loop

### Phase 5: Business Plan
- AI draft generation
- Section editor
- Export functionality
- Sharing system

### Phase 6: Evaluation
- Evaluation criteria parsing
- AI evaluation engine
- Feedback generation
- Upload support

### Phase 7: Notifications
- Discord/Slack webhooks
- Resend email integration
- Notification settings
- Alert scheduling

### Phase 8: Optimization
- Performance tuning
- Caching implementation
- Test coverage
- Documentation

---

## 9. Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_KEY="..."

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="[openssl rand -base64 32]"

# OAuth Providers
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
KAKAO_CLIENT_ID="..."
KAKAO_CLIENT_SECRET="..."

# AI
GEMINI_API_KEY="..."

# Notifications
RESEND_API_KEY="..."

# Cache
UPSTASH_REDIS_URL="..."
UPSTASH_REDIS_TOKEN="..."

# Microservices (Railway)
RAILWAY_API_URL="https://your-railway-app.railway.app"
CRAWLER_SERVICE_URL="..."
HWP_PARSER_URL="..."
PDF_PARSER_URL="..."
AI_PROCESSOR_URL="..."

# RAG / Embeddings
OPENAI_API_KEY="..."                      # For text-embedding-3-small
EMBEDDING_MODEL="text-embedding-3-small"   # 1536 dimensions
EMBEDDING_DIMENSIONS="1536"
CHUNK_SIZE="512"                           # Tokens per chunk
CHUNK_OVERLAP="50"                         # Overlap tokens
```

---

## 10. Success Metrics

### Key Performance Indicators
| Metric | Target |
|--------|--------|
| Matching accuracy | > 80% user satisfaction |
| AI plan quality | > 70% approval rate |
| Page load time | < 2 seconds |
| API response time | < 500ms (p95) |
| System uptime | > 99.5% |

### User Engagement Metrics
- Daily Active Users (DAU)
- Business plans created per user
- Matching results viewed
- Notification engagement rate

---

## 11. Risk Assessment

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| AI API rate limits | High | Caching, queue system |
| Document parsing failures | Medium | Fallback processing, manual review |
| Database performance | Medium | Indexing, connection pooling |
| Third-party service outages | Medium | Retry logic, graceful degradation |

### Business Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Low matching accuracy | High | Continuous algorithm improvement |
| User adoption | High | Intuitive UX, onboarding |
| Data privacy concerns | High | RLS, encryption, compliance |

---

## 12. RAG Architecture

### 12.1 Technology Stack

| Component | Technology | Benchmark Score | Purpose |
|-----------|------------|-----------------|---------|
| Vector DB | Supabase pgvector | 94.5 | Primary vector storage with HNSW indexing |
| Embeddings | Vercel AI SDK + OpenAI | 88.8 | TypeScript-native embedding generation |
| Hybrid Search | pgvector + GIN | - | Semantic + keyword combined search |
| Document Parsing | Railway Microservices | - | HWP/HWPX/PDF → Text conversion |

### 12.2 Document Ingestion Pipeline

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Data Sources   │      │  Railway Services │      │  Local Process  │
│                 │      │                  │      │                 │
│ • Gov Crawler   │─────▶│ document-gateway │─────▶│ Text Extraction │
│ • Company Docs  │      │  ├─ hwp-parser   │      │                 │
│ • Business Plans│      │  ├─ hwpx-parser  │      │                 │
│                 │      │  └─ pdf-parser   │      │                 │
└─────────────────┘      └──────────────────┘      └────────┬────────┘
                                                            │
                         ┌──────────────────┐      ┌────────▼────────┐
                         │  Supabase        │      │  Vercel AI SDK  │
                         │  pgvector        │◀─────│  embed()        │
                         │                  │      │                 │
                         │ document_        │      │ text-embedding- │
                         │ embeddings       │      │ 3-small (1536d) │
                         └──────────────────┘      └─────────────────┘
```

### 12.3 Chunking Strategy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk Size | 512 tokens | Optimal retrieval accuracy |
| Overlap | 50 tokens | Context preservation between chunks |
| Metadata | source_type, document_id, page_num, section_title | Filtering & traceability |

### 12.4 Vector Storage Schema

```sql
-- Main embeddings table
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference
  source_type VARCHAR(50) NOT NULL, -- 'support_project' | 'company' | 'business_plan'
  source_id UUID NOT NULL,

  -- Content
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_metadata JSONB DEFAULT '{}',

  -- Vector (1536 for OpenAI embeddings)
  embedding vector(1536) NOT NULL,

  -- Search optimization
  keywords TEXT[], -- BM25 keyword search

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(source_type, source_id, chunk_index)
);

-- HNSW Index for fast similarity search (cosine)
CREATE INDEX idx_embeddings_hnsw ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for keyword search
CREATE INDEX idx_embeddings_keywords ON document_embeddings
  USING GIN (keywords);

-- Composite index for filtered searches
CREATE INDEX idx_embeddings_source ON document_embeddings (source_type, source_id);
```

### 12.5 Hybrid Search Function

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_keywords TEXT[] DEFAULT '{}',
  source_filter VARCHAR(50) DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  semantic_weight FLOAT DEFAULT 0.7
) RETURNS TABLE (
  id UUID,
  source_type VARCHAR,
  source_id UUID,
  content TEXT,
  chunk_metadata JSONB,
  similarity FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      de.id,
      de.source_type,
      de.source_id,
      de.content,
      de.chunk_metadata,
      1 - (de.embedding <=> query_embedding) AS similarity,
      COALESCE(
        (SELECT COUNT(*)::FLOAT / NULLIF(array_length(query_keywords, 1), 0)
         FROM unnest(de.keywords) k
         WHERE k = ANY(query_keywords)),
        0
      ) AS keyword_score
    FROM document_embeddings de
    WHERE (source_filter IS NULL OR de.source_type = source_filter)
      AND 1 - (de.embedding <=> query_embedding) > match_threshold
  )
  SELECT
    sr.id,
    sr.source_type,
    sr.source_id,
    sr.content,
    sr.chunk_metadata,
    sr.similarity,
    sr.keyword_score,
    (sr.similarity * semantic_weight + sr.keyword_score * (1 - semantic_weight)) AS combined_score
  FROM semantic_results sr
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
```

### 12.6 RAG Retrieval Strategies by Feature

| Feature | Source Type | Strategy | Context Limit |
|---------|-------------|----------|---------------|
| Project Summary | support_project | All chunks by source_id | Full document |
| Company-Project Matching | support_project | Hybrid search (semantic 60%, keyword 40%) | Top 20 chunks |
| Business Plan Draft | Multi-source | Priority assembly: project(40%), company(35%), references(25%) | 8K tokens |
| Plan Evaluation | business_plan + criteria | Cross-reference matching | 6K tokens |

### 12.7 Local ↔ Railway Orchestration

#### Service Distribution

| Location | Services | Purpose |
|----------|----------|---------|
| **Railway** | crawler, document-gateway, hwp-parser, hwpx-parser, pdf-parser, cache, scheduler | Heavy processing, stateless HTTP APIs |
| **Local (Next.js)** | Orchestration, Embedding, Vector Storage, LLM calls, Business Logic | Coordination, AI processing, data persistence |

#### Environment-Based Routing

```typescript
// lib/services/railway.ts
const RAILWAY_BASE_URL = process.env.RAILWAY_API_URL || 'http://localhost:3001';

export const parseDocument = async (file: File, type: 'hwp' | 'hwpx' | 'pdf') => {
  const formData = new FormData();
  formData.append('file', file);

  return fetch(`${RAILWAY_BASE_URL}/document-gateway/parse`, {
    method: 'POST',
    body: formData,
    headers: { 'X-Parser-Type': type }
  });
};

export const triggerCrawl = async (sourceId: string) => {
  return fetch(`${RAILWAY_BASE_URL}/crawler/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceId })
  });
};
```

#### Local Development (Docker Compose)

```yaml
# docker-compose.local.yml
version: '3.8'
services:
  document-gateway:
    build: ./railway-services/document-gateway
    ports:
      - "3001:3000"

  hwp-parser:
    build: ./railway-services/hwp-parser
    environment:
      - PARSER_PORT=3002

  hwpx-parser:
    build: ./railway-services/hwpx-parser
    environment:
      - PARSER_PORT=3003

  pdf-parser:
    build: ./railway-services/pdf-parser
    environment:
      - PARSER_PORT=3004
```

### 12.8 RAG Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER REQUEST                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌───────────┐    ┌───────────┐    ┌───────────┐
            │ Matching  │    │ Draft Gen │    │Evaluation │
            │   RAG     │    │    RAG    │    │   RAG     │
            └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                  │                │                │
                  ▼                ▼                ▼
         ┌────────────────────────────────────────────────┐
         │              hybrid_search()                    │
         │   semantic (pgvector) + keyword (GIN)          │
         └────────────────────────────────────────────────┘
                                │
                                ▼
         ┌────────────────────────────────────────────────┐
         │              Context Assembly                   │
         │   • Priority-based chunk selection             │
         │   • Token budget management                    │
         │   • Metadata enrichment                        │
         └────────────────────────────────────────────────┘
                                │
                                ▼
         ┌────────────────────────────────────────────────┐
         │              LLM Generation                     │
         │   Gemini 2.5 Pro / Flash                       │
         └────────────────────────────────────────────────┘
                                │
                                ▼
         ┌────────────────────────────────────────────────┐
         │              Response                           │
         │   • Match results with explanations            │
         │   • Generated business plan sections           │
         │   • Evaluation feedback with scores            │
         └────────────────────────────────────────────────┘
```

---

## Appendix A: UI Component Migration

기존 프로젝트에서 다음 UI 컴포넌트와 CSS 설정을 그대로 가져옵니다:

### Components (shadcn/ui)
- alert, avatar, badge, button, card
- dialog, input, label, pagination
- popover, progress, select, skeleton
- switch, table, tabs, textarea
- toast, toaster, use-toast

### CSS Variables (globals.css)
```css
:root {
  --background: 0 0% 100%;
  --foreground: 210 25% 7.8431%;
  --primary: 160.9346 49.7674% 57.8431%;
  --secondary: 204.4068 51.3043% 22.5490%;
  /* ... (기존 값 유지) */
}
```

### Tailwind Config
```typescript
// borderRadius, fontFamily 등 기존 설정 유지
```

