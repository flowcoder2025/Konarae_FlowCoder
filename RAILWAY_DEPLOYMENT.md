# Railway 크롤러 워커 배포 가이드

## 📋 개요

Vercel Serverless 제한(60초)을 극복하기 위해 크롤러를 Railway로 분리 배포합니다.

**아키텍처**:
```
[Vercel] Next.js App
   ↓ QStash Cron (KST 06:00)
   ↓
[Railway] Crawler Worker (시간 무제한)
   ↓
[Supabase] Database + Storage
```

---

## 🚀 빠른 시작

### 1. Railway 프로젝트 생성

#### Option A: GitHub 연동 (권장)

1. **Railway 대시보드** 접속: https://railway.app
2. **New Project** 클릭
3. **Deploy from GitHub repo** 선택
4. 저장소 선택: `Konarae_flowcoder`
5. 브랜치 선택: `main`

#### Option B: CLI 배포

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 초기화
railway init

# 배포
railway up
```

---

### 2. Railway 환경변수 설정

Railway Dashboard → Settings → Variables로 이동하여 다음 환경변수를 추가합니다:

#### 필수 환경변수

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres

# AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key

# Supabase Storage
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Worker API Key (보안 키 생성)
WORKER_API_KEY=your_secure_random_key_here
```

#### 보안 키 생성 방법

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Online (안전)
# https://www.random.org/passwords/
```

**생성된 키 예시**:
```
Xr9kP2mL5vN8wQ3tY6hF4sD7gJ0aZ1cB9eO8uI5rT4yW2xV6pM3nK1jH0fG9dC7bA5sQ2wE8rT4yU6iO9pL3kJ1hG0fD5sA2zX4cV7bN1mM
```

---

### 3. Railway 서비스 설정

**Start Command 설정**:
- Command: `npm run worker`
- Railway가 자동으로 감지하지만, 수동 설정도 가능

**Health Check 설정** (선택사항):
- Path: `/health`
- Timeout: 30초

**Restart Policy**:
- Type: `ON_FAILURE`
- Max Retries: 3

---

### 4. Vercel 환경변수 추가

Vercel Dashboard → Settings → Environment Variables로 이동:

```env
# Railway 워커 URL (Railway 배포 후 확인)
RAILWAY_CRAWLER_URL=https://your-app.up.railway.app

# Worker API Key (Railway와 동일한 키)
WORKER_API_KEY=your_secure_random_key_here
```

**Railway URL 확인 방법**:
1. Railway Dashboard → Deployment
2. "Domain" 섹션에서 `*.up.railway.app` URL 복사
3. Vercel 환경변수에 추가

---

### 5. 의존성 설치

로컬 개발 환경:

```bash
# pnpm 사용
pnpm install

# 또는 npm
npm install
```

---

### 6. 로컬 테스트

Railway 배포 전 로컬에서 워커 서버 테스트:

```bash
# 환경변수 설정 (.env.local)
WORKER_API_KEY=test_key_123
DATABASE_URL=your_database_url
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# 워커 서버 실행
npm run worker:dev

# 다른 터미널에서 테스트 요청
curl -X POST http://localhost:3001/crawl \
  -H "Authorization: Bearer test_key_123" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-job-id"}'

# Health Check
curl http://localhost:3001/health
```

---

### 7. Railway 배포

#### GitHub 연동 (자동 배포)

1. 코드를 GitHub에 푸시
2. Railway가 자동으로 감지하고 배포
3. 배포 로그 확인: Railway Dashboard → Deployments

#### CLI 배포

```bash
# 배포
railway up

# 로그 확인
railway logs

# 환경변수 확인
railway variables
```

---

### 8. 배포 확인

#### Health Check

```bash
curl https://your-app.up.railway.app/health
```

**예상 응답**:
```json
{
  "status": "ok",
  "service": "crawler-worker",
  "timestamp": "2025-12-13T12:00:00.000Z",
  "uptime": 123.456,
  "memory": {
    "rss": 123456789,
    "heapTotal": 45678901,
    "heapUsed": 23456789
  }
}
```

#### 크롤러 테스트

```bash
# Vercel Cron 수동 실행 (Admin 대시보드 또는 API)
curl -X POST https://your-vercel-app.com/api/cron/crawl-all \
  -H "x-api-key: YOUR_ADMIN_API_KEY"

# Railway 로그 확인
railway logs --follow
```

---

## 🔧 트러블슈팅

### 문제: Railway 배포 실패

**증상**: 빌드 에러 또는 시작 실패

**해결**:
1. Railway 로그 확인: `railway logs`
2. package.json 확인: `worker` 스크립트 존재 여부
3. 환경변수 확인: 필수 변수 모두 설정되었는지

### 문제: Vercel → Railway 연결 실패

**증상**: Cron이 실행되지만 크롤링 안됨

**해결**:
1. Vercel 로그 확인: "Railway configuration missing" 에러
2. 환경변수 확인:
   ```bash
   # Vercel 환경변수
   RAILWAY_CRAWLER_URL=https://...
   WORKER_API_KEY=...
   ```
3. Railway URL이 올바른지 확인 (https 포함)
4. API 키가 Railway와 동일한지 확인

### 문제: 크롤링 작업 실패

**증상**: Railway 워커가 실행되지만 작업 실패

**해결**:
1. Railway 로그 확인: `railway logs --follow`
2. DB 연결 확인:
   ```sql
   SELECT * FROM crawl_job WHERE status = 'failed';
   ```
3. Supabase 연결 테스트:
   ```bash
   # Railway 컨테이너에서
   psql $DATABASE_URL -c "SELECT 1;"
   ```

### 문제: 메모리 부족

**증상**: Railway 워커가 자주 재시작

**해결**:
1. Railway Dashboard → Settings → Resources
2. 메모리 증설: 512MB → 1GB 또는 2GB
3. 비용: Hobby ($5) → Pro ($20)

---

## 📊 모니터링

### Railway 대시보드

- **Deployments**: 배포 이력 및 로그
- **Metrics**: CPU, 메모리, 네트워크 사용량
- **Logs**: 실시간 로그 스트리밍

### Supabase 대시보드

- **Table Editor**: `crawl_job`, `crawl_source` 테이블 확인
- **Logs**: DB 쿼리 로그 확인

### Vercel 대시보드

- **Functions**: Cron 실행 로그 확인
- **Environment Variables**: 환경변수 확인

---

## 💰 비용

### Railway Hobby 플랜

- **가격**: $5/월
- **리소스**:
  - 500시간 실행 시간
  - 512MB RAM (기본)
  - 1GB Storage
  - 공유 CPU

### 예상 사용량

- **크롤링 빈도**: 1일 1회 (KST 06:00)
- **크롤링 시간**: 20-30분/회
- **월 사용 시간**: ~15시간
- **비용**: $5/월 (충분)

---

## 🔐 보안 체크리스트

- [ ] WORKER_API_KEY를 강력한 랜덤 키로 설정
- [ ] Railway 환경변수에 민감정보 저장 (코드에 하드코딩 금지)
- [ ] Vercel 환경변수 동일하게 설정
- [ ] Railway Dashboard에서 API 키 외부 노출 방지
- [ ] Supabase Row Level Security (RLS) 설정
- [ ] Railway 서비스 로그 주기적 확인

---

## 📝 다음 단계

1. **Bull Queue 도입** (선택사항):
   - 작업 재시도 및 우선순위 관리
   - Redis 추가 필요 ($5-10/월)

2. **모니터링 강화** (선택사항):
   - Sentry 연동 (에러 트래킹)
   - LogTail 연동 (로그 관리)

3. **성능 최적화**:
   - 파일 다운로드 병렬 처리
   - AI 분석 배치 처리
   - DB 쿼리 최적화

---

## 🆘 문제 발생 시

1. **Railway 로그 확인**: `railway logs --follow`
2. **Vercel 로그 확인**: Dashboard → Functions → Logs
3. **Supabase 로그 확인**: Dashboard → Logs → Postgres Logs
4. **Issue 등록**: GitHub Issues에 문제 상황 상세 기록

---

## 🎉 배포 완료!

축하합니다! Railway 크롤러 워커 배포가 완료되었습니다.

**확인 사항**:
- ✅ Railway 서비스 실행 중
- ✅ Health check 정상 응답
- ✅ Vercel Cron이 Railway로 작업 위임
- ✅ 크롤링 작업 성공

다음 Cron 실행 시간(KST 06:00)에 자동으로 크롤링이 시작됩니다!
