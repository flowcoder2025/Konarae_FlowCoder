# 비동기 임베딩 생성 시스템 배포 가이드

## 📋 시스템 개요

크롤러 성능 부하를 방지하기 위해 임베딩 생성을 별도 워크플로우로 분리한 아키텍처:

```
크롤러 → needsEmbedding=true 플래그 설정
   ↓
Vercel Cron Job (매일 02:00 KST)
   ↓
Railway Worker (무제한 실행 시간)
   ↓
OpenAI API → 임베딩 생성
   ↓
PostgreSQL에 저장 + needsEmbedding=false
```

## ✅ 완료된 작업

1. **데이터베이스 마이그레이션** ✅
   - `needsEmbedding` 컬럼 추가
   - 인덱스 생성
   - 기존 프로젝트 플래그 설정

2. **크롤러 코드 수정** ✅
   - `/lib/crawler/worker.ts:1996` - UPDATE 시 `needsEmbedding: true`
   - `/lib/crawler/worker.ts:2009` - CREATE 시 `needsEmbedding: true`

3. **Vercel Cron Job API** ✅
   - `/app/api/cron/generate-embeddings/route.ts` 생성
   - 인증: Vercel Cron Secret, QStash, Admin API Key 지원
   - Railway로 작업 위임

4. **Railway Worker 코드** ✅
   - `/railway-embedding-endpoint.ts` 템플릿 생성
   - 배치 처리 (50개씩)
   - 에러 핸들링 포함

## 🚀 배포 단계

### 1단계: Railway Worker 배포

Railway 프로젝트의 `worker-server.ts` 파일에 엔드포인트 추가:

```bash
# 1. Railway 프로젝트 위치로 이동
cd /path/to/railway-worker

# 2. railway-embedding-endpoint.ts 내용을 worker-server.ts에 복사
# 기존 /crawl 엔드포인트 아래에 다음 두 엔드포인트 추가:
# - POST /generate-embeddings
# - GET /embedding-stats

# 3. Railway에 배포
railway up
```

**필수 환경변수 (Railway):**
```env
WORKER_API_KEY=<보안키>
DATABASE_URL=<Supabase 연결 URL>
OPENAI_API_KEY=<OpenAI API 키>
```

**테스트:**
```bash
curl -X POST https://your-railway-url.railway.app/generate-embeddings \
  -H "Authorization: Bearer ${WORKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 10}'
```

### 2단계: Vercel 환경변수 설정

Vercel 프로젝트 설정에 추가:

```env
# Railway 연동
RAILWAY_CRAWLER_URL=https://your-railway-url.railway.app
WORKER_API_KEY=<Railway와 동일한 보안키>

# Cron 인증
CRON_SECRET=<Vercel Cron Secret>
ADMIN_API_KEY=<수동 트리거용 관리자 키>
```

### 3단계: Vercel Cron 스케줄 설정

`vercel.json`에 cron 작업 추가:

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-embeddings",
      "schedule": "0 20 * * *"
    }
  ]
}
```

> **Note**: `0 20 * * *` = 매일 20:00 UTC = 05:00 KST (다음날)

또는 **Upstash QStash** 사용:

```bash
# QStash 대시보드에서 스케줄 생성
URL: https://your-vercel-app.vercel.app/api/cron/generate-embeddings
Schedule: 0 20 * * *
Method: POST
Headers:
  - upstash-signature: <자동 생성>
```

### 4단계: 초기 임베딩 생성

기존 프로젝트들의 임베딩을 한 번 생성:

```bash
# 수동 트리거 (관리자 API 키 사용)
curl -X POST https://your-vercel-app.vercel.app/api/cron/generate-embeddings \
  -H "x-api-key: ${ADMIN_API_KEY}"
```

**예상 소요 시간:**
- 프로젝트 100개 기준: ~5분
- 프로젝트 1000개 기준: ~50분 (Railway는 무제한 실행)

### 5단계: 모니터링 설정

**임베딩 상태 확인:**
```bash
curl https://your-railway-url.railway.app/embedding-stats \
  -H "Authorization: Bearer ${WORKER_API_KEY}"
```

**응답 예시:**
```json
{
  "totalProjects": 1000,
  "needsEmbedding": 50,
  "hasEmbeddings": 950,
  "completionRate": 95,
  "timestamp": "2025-12-13T07:00:00.000Z"
}
```

## 🔧 테스트 시나리오

### 시나리오 1: 새 프로젝트 크롤링
```
1. 크롤러 실행 → 새 프로젝트 생성
2. needsEmbedding = true 확인
3. Cron 작업 대기 또는 수동 트리거
4. Railway 로그 확인: "✓ Generated embeddings for: [프로젝트명]"
5. needsEmbedding = false 확인
```

### 시나리오 2: 기존 프로젝트 업데이트
```
1. 크롤러 실행 → 기존 프로젝트 업데이트
2. needsEmbedding = true로 재설정
3. Cron 작업 대기 또는 수동 트리거
4. 임베딩 재생성 확인
```

### 시나리오 3: 에러 복구
```
1. Railway 로그에서 실패한 프로젝트 확인
2. 실패한 프로젝트는 needsEmbedding = true 유지
3. 다음 Cron 실행 시 재시도
```

## 📊 성능 메트릭

**예상 처리량:**
- 배치 크기: 50개
- 프로젝트당 OpenAI API 호출: 1회
- 프로젝트당 처리 시간: ~3초
- 배치당 총 시간: ~2.5분

**비용 예측 (text-embedding-3-small):**
- 1M 토큰당 $0.02
- 프로젝트당 평균 토큰: ~500
- 1000개 프로젝트 = 500K 토큰 = $0.01

## ⚠️ 주의사항

1. **Railway 환경변수**: `WORKER_API_KEY`는 Vercel과 동일해야 함
2. **첫 실행**: 기존 프로젝트가 많으면 초기 실행 시간 길 수 있음
3. **에러 처리**: 실패한 프로젝트는 자동 재시도됨 (needsEmbedding 유지)
4. **OpenAI 할당량**: API rate limit 확인 필요 (tier에 따라 다름)

## 🔍 트러블슈팅

### Railway 워커 응답 없음
```bash
# Railway 로그 확인
railway logs

# 환경변수 확인
railway variables
```

### Vercel Cron 실행 안됨
```bash
# Vercel 로그 확인
vercel logs

# Cron 설정 확인
vercel env ls
```

### 임베딩 생성 실패
```bash
# Railway 로그에서 에러 확인
# OpenAI API 키 확인
# 프로젝트 내용 확인 (빈 내용인 경우 스킵됨)
```

## 📝 체크리스트

배포 전 확인:
- [ ] Railway 환경변수 설정 완료
- [ ] Vercel 환경변수 설정 완료
- [ ] Railway 엔드포인트 테스트 성공
- [ ] Vercel Cron 스케줄 설정 완료
- [ ] 초기 임베딩 생성 완료
- [ ] 모니터링 엔드포인트 확인

## 🎯 다음 단계

1. Railway 워커 배포
2. Vercel 환경변수 설정
3. 초기 임베딩 생성 (수동 트리거)
4. Cron 스케줄 활성화
5. 24시간 모니터링
