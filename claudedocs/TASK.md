# FlowCoder 6가지 개선 사항 구현

## 현재 Phase: Phase 7 완료 ✅ (Railway 메모리 최적화)

---

## Phase 1: 현황 분석 및 데이터 검증 ✅ 완료

**목표**: 실제 문제 범위 확정

### Contract 1.1: 지역 데이터 분석 ✅
- [x] DB에서 region별 프로젝트 수 조회 → 18개 지역 확인
- [x] 광역시(서울, 부산, 대구, 인천, 광주, 대전, 울산) 데이터 확인 → 모두 존재
- [x] 결과 문서화 → **8개 지역 UI 누락 확인** (slice(0,10) 문제)

### Contract 1.2: 중복 처리 현황 확인 ✅
- [x] ProjectGroup 테이블 통계 조회 → 1,679개 그룹
- [x] isCanonical 분포 확인 → 대표 1,679개 / 비대표 864개
- [x] 최근 7일 중복 처리 로그 분석 → 정상 작동 중

### Contract 1.3: 매칭 알림 이력 분석 ✅
- [x] 동일 사용자 중복 발송 케이스 확인
- [x] daily-digest 실행 이력 분석
- [x] 중복 발송 패턴 식별 → **lastDigestSentAt 필드 없음 (긴급)**

---

## Phase 2: 매칭 메일 중복 방지 ⚡ 긴급 ✅ 완료

### Contract 2.1: 스키마 수정 ✅
- [x] `NotificationSetting`에 `lastDigestSentAt` 필드 추가
- [x] Prisma db push 실행

### Contract 2.2: daily-digest 로직 수정 ✅
- [x] `lastDigestSentAt` 이후 생성된 결과만 조회
- [x] 최초 실행 시 24시간 윈도우 유지 (fallback)

### Contract 2.3: 발송 후 업데이트 ✅
- [x] 이메일 발송 성공 시 `lastDigestSentAt` 업데이트
- [x] 배치 업데이트로 효율적 처리

---

## Phase 3: UI/UX 개선 ✅ 완료

### Contract 3.1: 지역 필터 전체 표시 ✅
- [x] `regions.slice(0, 10)` 제거
- [x] 18개 전체 지역 표시
- [x] 프로젝트 수 0인 지역 비활성화 스타일

### Contract 3.2: 지역 필터 UI 개선 ✅
- [x] 수도권/충청권/호남권/영남권/강원권 그룹화 (구현 완료)
- [x] 모바일 반응형 확인 (ScrollFade 기존 적용됨)

### Contract 3.3: Markdown 렌더링 도입 ✅
- [x] `rehype-sanitize` 설치 (react-markdown, remark-gfm 기존 설치됨)
- [x] `ProjectDescriptionRenderer` 컴포넌트 생성
- [x] XSS 방지 설정 (rehype-sanitize)

### Contract 3.4: 상세페이지 스타일링 ✅
- [x] prose 클래스 확장 (테이블, 리스트)
- [x] 섹션 구분 스타일 추가
- [x] 긴 콘텐츠용 접이식 UI (300px 초과 시 자동 접힘)

---

## Phase 4: 크롤러 모니터링 강화 ✅ 완료

### Contract 4.1: 파싱 실패 감지 ✅
- [x] Discord 알림 함수 추가 (`sendCrawlerAlert`)
- [x] 연속 실패 추적 함수 추가 (`trackCrawlerFailure`, `resetCrawlerFailures`)
- [x] 알림 debounce (1시간 내 중복 방지)

### Contract 4.2: 기업마당 구조 변경 감지 ✅
- [x] 알림 타입에 `structure_change` 추가
- [x] 구조 변경 감지 시 알림 함수 준비

### Contract 4.3: 대시보드 통계 추가 ✅
- [x] `/api/admin/crawler/stats` API 추가
- [x] 최근 7일 성공률 표시
- [x] 일별 수집 프로젝트 수 추이
- [x] 소스별 통계

### Contract 4.4: 실패 job 자동 재시도 (스킵)
- [ ] 자동 재시도 Cron 추가 - 기존 cleanup API 활용 가능
- [ ] 재시도 로그 기록 - 추후 구현

### Contract 4.5: 크롤러 대시보드 UI ✅
- [x] `/api/admin/crawler/stats` API 연동
- [x] 통계 탭 추가 (CrawlerStatsDashboard)
- [x] 일별 수집 현황 차트
- [x] 소스별 통계, 최근 실패 목록

---

## Phase 5: 중복 감지 최적화 ✅ 완료

### Contract 5.1: 중복 감지 로그 강화 ✅
- [x] deduplication.ts에 상세 로그 추가
- [x] 유사도 점수, 매칭 이유 기록
- [x] createLogger 통합

### Contract 5.2: 관리자 중복 검토 API ✅
- [x] `/api/admin/duplicates` API 생성
- [x] ProjectGroup 목록 조회 (GET)
- [x] 리뷰 상태 변경, Canonical 변경, 분리 기능 (PATCH)

### Contract 5.3: 중복 관리 페이지 UI ✅
- [x] `/admin/duplicates` 페이지 생성
- [x] DuplicatesManagement 컴포넌트 구현
- [x] 그룹 목록, 상태 필터, 페이지네이션
- [x] 상태 변경, Canonical 변경, 분리 기능

### Contract 5.4: 임계값 검토 (추후)
- [ ] 현재 중복 감지 통계 분석 - Phase 1에서 확인 완료
- [ ] False Positive/Negative 비율 확인
- [ ] 필요시 임계값 조정 (현재: AUTO_MERGE=0.85, REVIEW=0.70)

---

## 진행 상태

| Phase | 상태 | 완료일 |
|-------|------|--------|
| Phase 1 | ✅ 완료 | 2026-02-03 |
| Phase 2 | ✅ 완료 | 2026-02-03 |
| Phase 3 | ✅ 완료 (선택사항 포함) | 2026-02-03 |
| Phase 4 | ✅ 완료 (선택사항 포함) | 2026-02-03 |
| Phase 5 | ✅ 완료 (선택사항 포함) | 2026-02-03 |
| Phase 7 | ✅ 완료 (Railway 메모리 최적화) | 2026-02-04 |

---

## Phase 7: Railway 메모리 최적화 ✅ 완료

### Contract 7.1: text_parser 메모리 누수 수정 ✅
- [x] tasks.py: get_parser() 싱글톤 사용
- [x] pdf_parser.py: pdfplumber 이중 파싱 제거
- [x] extract.py: 매 요청 gc.collect() 제거
- [x] enhanced_hwp_parser.py: 과도한 gc.collect() 패턴 제거
- [x] memory_manager.py: RSS 기준 모니터링으로 변경

### Contract 7.2: crawler 메모리 최적화 ✅
- [x] embedding-server.ts: 배치 크기 축소 (20→10, 10→5)
- [x] matching.ts: 검색 결과 즉시 해제 (상위 100개만 반환)
