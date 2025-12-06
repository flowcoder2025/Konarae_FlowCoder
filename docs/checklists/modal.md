# Modal Checklist

## 구조
- [ ] Title 존재 (접근성 필수)
- [ ] Body 영역 분리
- [ ] Footer에 버튼 조합

## 접근성 (필수)
- [ ] `role="dialog"`
- [ ] `aria-modal="true"`
- [ ] `aria-labelledby` 또는 `aria-label`
- [ ] 열릴 때 포커스 이동
- [ ] Tab 키 포커스 트랩
- [ ] ESC 키로 닫기
- [ ] 닫힐 때 트리거로 포커스 복귀

## 버튼 조합
- [ ] 일반: `outline`(취소) + `default`(확인)
- [ ] 삭제: `outline`(취소) + `destructive`(삭제)
- [ ] 정보: `default`(확인)만

## i18n
- [ ] Title: `LID.MODAL.{TYPE}.TITLE`
- [ ] Button: `BTN.MODAL.{ACTION}`
