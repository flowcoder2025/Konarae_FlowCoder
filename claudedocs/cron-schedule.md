# Cron Job 스케줄 정리

## 📅 일일 자동화 작업 타임라인 (KST 기준)

```
00:00 - 크롤링 시작 준비
01:00 ⚡ 전체 크롤링 실행 (crawl-all)
      ↓ 새로운 지원사업 데이터 수집
      ↓ needsEmbedding=true 플래그 설정
02:00 - 크롤링 완료 (예상)
03:00 - 대기
04:00 - 대기
05:00 ⚡ 임베딩 생성 실행 (generate-embeddings)
      ↓ 크롤링된 프로젝트 임베딩 생성
      ↓ 배치 처리 (50개씩)
06:00 - 임베딩 완료 (예상)
07:00 - 사용자 활동 시작
08:00 - 서비스 정상 운영
09:00 ⚡ 마감일 알림 발송 (deadline-alerts)
10:00 - 서비스 정상 운영
11:00 - 서비스 정상 운영
12:00 ⚡ 매칭 결과 갱신 (matching-refresh)
```

## 🔧 Vercel Cron 설정 (UTC)

### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/crawl-all",
      "schedule": "0 16 * * *",
      "comment": "KST 01:00 - 전체 크롤링"
    },
    {
      "path": "/api/cron/generate-embeddings",
      "schedule": "0 20 * * *",
      "comment": "KST 05:00 - 임베딩 생성"
    },
    {
      "path": "/api/cron/deadline-alerts",
      "schedule": "0 0 * * *",
      "comment": "KST 09:00 - 마감일 알림"
    },
    {
      "path": "/api/cron/matching-refresh",
      "schedule": "0 3 * * *",
      "comment": "KST 12:00 - 매칭 갱신"
    }
  ]
}
```

## 📊 작업별 상세 정보

### 1. 전체 크롤링 (crawl-all)
- **시간**: 매일 01:00 KST (16:00 UTC 전날)
- **소요 시간**: 약 30분 ~ 1시간
- **처리 내용**:
  - 모든 활성화된 크롤링 소스 처리
  - 새 프로젝트 생성 또는 기존 프로젝트 업데이트
  - `needsEmbedding=true` 플래그 자동 설정
- **실행 위치**: Railway Worker (무제한 시간)
- **API**: `POST /crawl` (Railway)

### 2. 임베딩 생성 (generate-embeddings)
- **시간**: 매일 05:00 KST (20:00 UTC 전날)
- **소요 시간**: 약 50분 (프로젝트 1000개 기준)
- **처리 내용**:
  - `needsEmbedding=true`인 프로젝트 검색
  - 배치 처리 (50개씩)
  - OpenAI API 호출하여 임베딩 생성
  - `needsEmbedding=false` 업데이트
- **실행 위치**: Railway Worker (무제한 시간)
- **API**: `POST /generate-embeddings` (Railway)
- **비용**: $0.01/1000개 (text-embedding-3-small)

### 3. 마감일 알림 (deadline-alerts)
- **시간**: 매일 09:00 KST (00:00 UTC)
- **소요 시간**: 약 5분
- **처리 내용**:
  - 7일 이내 마감 예정 프로젝트 확인
  - 사용자별 알림 발송 (이메일/웹훅)
- **실행 위치**: Vercel Serverless (60초 제한)

### 4. 매칭 갱신 (matching-refresh)
- **시간**: 매일 12:00 KST (03:00 UTC)
- **소요 시간**: 약 10분
- **처리 내용**:
  - 신규 프로젝트와 기업 자동 매칭
  - 매칭 점수 재계산
  - 추천 결과 업데이트
- **실행 위치**: Vercel Serverless (60초 제한)

## 🔄 작업 순서의 논리

1. **새벽 1시 크롤링**
   - 사용자 활동 없는 시간대
   - 크롤링 부하가 서비스에 영향 없음
   - 새벽에 업데이트된 공고 수집

2. **새벽 5시 임베딩**
   - 크롤링 완료 후 충분한 시간 확보
   - 사용자 활동 시작 전 완료
   - 오전부터 최신 검색 결과 제공

3. **오전 9시 알림**
   - 사용자가 출근/업무 시작하는 시간
   - 알림 확인률 높은 시간대

4. **낮 12시 매칭**
   - 점심시간 전후 확인 가능
   - 새로운 매칭 결과 제공

## ⚠️ 주의사항

### 시간대 변환
- **KST = UTC + 9시간**
- **예**: KST 01:00 = UTC 16:00 (전날)
- Vercel Cron은 항상 UTC 기준

### 실행 시간 제한
| 서비스 | 제한 시간 | 용도 |
|--------|----------|------|
| Vercel Serverless | 60초 | 짧은 작업 (알림, 매칭) |
| Railway Worker | 무제한 | 긴 작업 (크롤링, 임베딩) |

### 재시도 정책
- **크롤링**: 실패 시 다음날 재시도
- **임베딩**: `needsEmbedding=true` 유지하여 다음 실행 시 재시도
- **알림/매칭**: 로그 기록, 수동 재실행 가능

## 🧪 수동 트리거 방법

### 크롤링 수동 실행
```bash
curl -X POST https://your-app.vercel.app/api/cron/crawl-all \
  -H "x-api-key: ${ADMIN_API_KEY}"
```

### 임베딩 수동 실행
```bash
curl -X POST https://your-railway-url.railway.app/generate-embeddings \
  -H "Authorization: Bearer ${WORKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50}'
```

### 알림 수동 실행
```bash
curl -X POST https://your-app.vercel.app/api/cron/deadline-alerts \
  -H "x-api-key: ${ADMIN_API_KEY}"
```

### 매칭 수동 실행
```bash
curl -X POST https://your-app.vercel.app/api/cron/matching-refresh \
  -H "x-api-key: ${ADMIN_API_KEY}"
```

## 📈 모니터링

### Vercel 대시보드
```
Dashboard → Logs → Filter by "/api/cron"
```

### Railway 대시보드
```
Worker 서비스 → Logs
[Embedding] Starting batch embedding generation
[Embedding] Batch complete: 50 success, 0 errors
```

### 성공 확인
```bash
# 임베딩 진행 상황
curl https://your-railway-url.railway.app/embedding-stats \
  -H "Authorization: Bearer ${WORKER_API_KEY}"
```

## 🔧 스케줄 변경 시

1. `vercel.json` 수정
2. 각 cron job 파일의 주석 업데이트
3. Git commit & push
4. Vercel 자동 재배포
5. 다음 실행 시간 확인

## 💡 최적화 팁

### 비용 절감
- 임베딩 배치 크기 조정 (기본 50개)
- 변경 없는 프로젝트 스킵 (자동)

### 성능 개선
- 크롤링 소스별 우선순위 설정
- 병렬 처리 최대화

### 안정성 향상
- 에러 로그 모니터링
- 재시도 횟수 제한
- 타임아웃 적절히 설정
