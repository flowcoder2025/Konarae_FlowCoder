# Railway Worker 서비스 설정 가이드

## 📋 개요

Railway 웹 대시보드에서 Worker 서비스를 처음 생성하는 방법입니다.

## 🚀 Railway 서비스 생성 (웹 대시보드)

### 1단계: Railway 프로젝트 생성/접속

1. **Railway 대시보드 접속**
   ```
   https://railway.app
   ```

2. **새 프로젝트 또는 기존 프로젝트 선택**
   - 새 프로젝트: "New Project" 클릭
   - 기존 프로젝트: 프로젝트 이름 클릭

### 2단계: Worker 서비스 추가

1. **"+ New" 버튼 클릭**
   - 프로젝트 내에서 우측 상단 또는 중앙의 "+ New" 버튼

2. **"GitHub Repo" 선택**
   - Deploy from GitHub Repository 선택

3. **레포지토리 선택**
   - `flowcoder2025/Konarae_FlowCoder` 선택
   - 권한 없으면 "Configure GitHub App" 클릭하여 권한 부여

4. **서비스 이름 설정**
   - 서비스 이름: `konarae-worker` (또는 원하는 이름)

### 3단계: 환경변수 설정

서비스 생성 후 **Variables** 탭 클릭:

```env
# 필수 환경변수
WORKER_API_KEY=<보안키 - Vercel과 동일하게>
DATABASE_URL=<Supabase Connection String>
DIRECT_URL=<Supabase Direct URL>
OPENAI_API_KEY=<OpenAI API Key>

# 선택 환경변수 (Vercel URL)
VERCEL_URL=<your-app.vercel.app>
NEXT_PUBLIC_SITE_URL=<https://your-app.vercel.app>
```

**환경변수 가져오기 (빠른 방법):**
- Vercel 프로젝트 → Settings → Environment Variables
- "Copy .env.local" 클릭하여 전체 복사
- Railway에 붙여넣기

### 4단계: 배포 설정 확인

1. **Settings** 탭 클릭

2. **Build Settings 확인:**
   - Builder: Nixpacks (자동 감지)
   - Build Command: 자동
   - Start Command: `pnpm run worker` (railway.json에서 설정됨)

3. **Deploy Settings:**
   - Branch: `main`
   - Auto Deploy: ✅ 활성화
   - Root Directory: `/` (기본값)

### 5단계: 배포 시작

1. **자동 배포 트리거**
   - Git push 시 자동 배포
   - 또는 "Deploy" 버튼 클릭하여 수동 배포

2. **배포 로그 확인**
   - Deployments 탭에서 실시간 로그 확인
   - "🚀 Railway Crawler Worker Started" 메시지 확인

### 6단계: Public URL 설정

1. **Settings → Networking**

2. **"Generate Domain" 클릭**
   - Railway가 자동으로 도메인 생성
   - 예: `konarae-worker-production.up.railway.app`

3. **URL 복사**
   - 이 URL을 Vercel 환경변수에 추가:
   ```env
   RAILWAY_CRAWLER_URL=https://konarae-worker-production.up.railway.app
   ```

## ✅ 배포 확인

### Health Check
```bash
curl https://your-railway-url.railway.app/health
```

**예상 응답:**
```json
{
  "status": "ok",
  "service": "crawler-worker",
  "timestamp": "2025-12-13T...",
  "uptime": 123.456,
  "memory": {...}
}
```

### Embedding Stats
```bash
curl https://your-railway-url.railway.app/embedding-stats \
  -H "Authorization: Bearer ${WORKER_API_KEY}"
```

**예상 응답:**
```json
{
  "totalProjects": 100,
  "needsEmbedding": 50,
  "hasEmbeddings": 50,
  "completionRate": 50,
  "timestamp": "2025-12-13T..."
}
```

## 🔧 Vercel 환경변수 추가

Railway URL을 얻은 후 Vercel 프로젝트에 추가:

1. **Vercel 대시보드 접속**
   ```
   https://vercel.com/dashboard
   ```

2. **프로젝트 → Settings → Environment Variables**

3. **환경변수 추가:**
   ```env
   RAILWAY_CRAWLER_URL=https://your-railway-url.railway.app
   ```

4. **Production + Preview 체크**

5. **"Save" 클릭**

6. **재배포 (선택사항)**
   - Deployments → 최신 배포 → "Redeploy"

## 📊 모니터링

### Railway 대시보드
- **Logs**: 실시간 로그 확인
- **Metrics**: CPU, Memory, Network 사용량
- **Deployments**: 배포 이력

### 로그 확인
```
Railway 대시보드 → Worker 서비스 → Logs 탭
```

**주요 로그 패턴:**
```
[Embedding] Starting batch embedding generation (batch size: 50)
[Embedding] Processing 10 project(s)
[Embedding] ✓ Generated embeddings for: 프로젝트명
[Embedding] Batch complete: 10 success, 0 errors in 15234ms
```

## 🐛 트러블슈팅

### 배포 실패
**증상**: "Build failed" 또는 "Deploy failed"

**해결:**
1. Deployments → 실패한 배포 클릭 → 로그 확인
2. 환경변수 누락 확인 (DATABASE_URL, OPENAI_API_KEY 등)
3. package.json의 "worker" 스크립트 확인

### 서비스 시작 실패
**증상**: "Application failed to respond"

**해결:**
1. Settings → Healthcheck 확인
2. 로그에서 에러 메시지 확인
3. PORT 환경변수 자동 제공 확인 (Railway가 자동 설정)

### 환경변수 오류
**증상**: "Unauthorized" 또는 "Connection refused"

**해결:**
1. Variables 탭에서 모든 환경변수 확인
2. WORKER_API_KEY가 Vercel과 동일한지 확인
3. DATABASE_URL이 올바른지 확인 (Supabase)

## 💰 비용 예측

**Railway 무료 플랜:**
- $5/월 크레딧 제공
- 시간당 크레딧 소모

**Worker 서비스 예상 비용:**
- Starter Plan (512MB RAM): ~$5-10/월
- Hobby Plan (1GB RAM): ~$10-20/월

**최적화:**
- Cron으로 하루 1번만 실행 → 대부분 유휴 상태
- 비용 효율적 (크롤러 + 임베딩 워커 통합)

## 🎯 완료 체크리스트

배포 완료 전 확인:
- [ ] Railway 프로젝트 생성
- [ ] Worker 서비스 추가 (GitHub 연동)
- [ ] 환경변수 설정 완료
- [ ] Public URL 생성
- [ ] Health Check 성공
- [ ] Vercel에 RAILWAY_CRAWLER_URL 추가
- [ ] Embedding Stats 확인 가능
- [ ] 로그 정상 출력

## 📝 다음 단계

1. ✅ Railway Worker 배포 완료
2. ⏭️ 초기 임베딩 생성 (수동 트리거)
   ```bash
   curl -X POST https://your-railway-url.railway.app/generate-embeddings \
     -H "Authorization: Bearer ${WORKER_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"batchSize": 10}'
   ```
3. ⏭️ Vercel Cron 자동 실행 확인 (내일 02:00 KST)
4. ⏭️ 24시간 모니터링
