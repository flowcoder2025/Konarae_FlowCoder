# Button Checklist

## Variant 검증
- [ ] `default` 또는 `outline` 사용 (주사용)
- [ ] `destructive`/`ghost`는 사용자 요청 시만
- [ ] 새 variant 추가 안 함

## 접근성
- [ ] 아이콘 버튼에 `aria-label`
- [ ] 로딩 시 `aria-busy="true"`
- [ ] `disabled` 상태에서 `pointer-events-none`
- [ ] 포커스 링 표시 (`focus-visible:ring-2`)

## 토큰
- [ ] 하드코딩 색상 없음 (`bg-[#xxx]` 금지)
- [ ] 정의된 size 사용 (`sm`/`default`/`lg`/`xl`/`icon`)

## i18n
- [ ] `getText()` 또는 `BUTTON_TEXT` 사용
- [ ] 한글 하드코딩 없음

## 조합 패턴
- [ ] 일반 확인: `outline` + `default`
- [ ] 삭제 확인: `outline` + `destructive`
- [ ] CTA: `default` (lg) + `outline` (lg)
