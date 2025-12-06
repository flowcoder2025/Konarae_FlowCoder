# UI System Overview (1장 요약)

> 전체 시스템 연결 지도 - 상세는 각 /docs 참조

---

## 연결 구조

```
[PRD] ─→ Primary Color ─→ [globals.css]
                              ↓
[naming.md] ─→ ID 체계 ─→ [text-config.ts] ─→ [Components]
                              ↓
[semantic.md] ─→ Tone Code ─→ [i18n 텍스트]
                              ↓
[tokens.md] ─→ Design Token ─→ [CVA variants]
                              ↓
[a11y.md] ─→ 접근성 규칙 ─→ [aria-* 속성]
```

---

## 핵심 규칙 요약

| 영역 | 규칙 | 참조 |
|-----|------|------|
| **Color** | Primary만 변경 → 전역 반영 | `globals.css` |
| **Button** | default + outline (주사용) | `components/button.md` |
| **Naming** | `{TYPE}.{DOMAIN}.{CONTEXT}` | `foundations/naming.md` |
| **i18n** | `getText(ID)` 사용, 하드코딩 금지 | `foundations/i18n.md` |
| **a11y** | WCAG AA, 키보드 접근, 포커스 트랩 | `foundations/accessibility.md` |

---

## 주요 파일 위치

| 용도 | 파일 |
|-----|------|
| 디자인 토큰 | `/src/app/globals.css` |
| i18n 텍스트 | `/src/lib/text-config.ts` |
| UI 컴포넌트 | `/src/components/ui/` |
| 유틸리티 | `/src/lib/utils.ts` |

---

## 새 기능 추가 시

```
1. 설계 요약 (3~5줄)
2. 코드 구현
3. 체크리스트로 검증 (/docs/checklists/)
4. (선택) Feature Batch 완료 후 문서 요청 시만 업데이트
```
