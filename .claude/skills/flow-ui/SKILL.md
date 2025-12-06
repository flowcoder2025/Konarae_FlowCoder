---
name: flow-ui
description: "Primary Color 기반 디자인 시스템으로 완성형 UI를 생성합니다. Use when the user requests UI components, pages, landing pages, login screens, hero sections, forms, cards, or any React/Next.js UI development with shadcn/ui and Tailwind CSS."
---

# Flow UI Skill

> **"Primary Color만 바꾸면 브랜드 완성"**

디자인 토큰 기반 UI 시스템을 Next.js 프로젝트에 설치하는 스킬입니다.

---

## 설치 방법

```bash
# 프로젝트 루트에서 실행
bash ~/.claude/skills/flow-ui/scripts/install.sh
```

### 설치되는 항목

| 파일 | 용도 |
|-----|------|
| `/claude.md` | 루트 헌법 (전역 원칙) |
| `/src/components/claude.md` | 컴포넌트 가이드 |
| `/src/components/ui/*.tsx` | 14개 UI 컴포넌트 |
| `/src/lib/claude.md` | 유틸리티 가이드 |
| `/src/lib/utils.ts` | cn() 함수 |
| `/src/lib/text-config.ts` | i18n 텍스트 |
| `/src/features/claude.md` | 기능 모듈 가이드 |
| `/src/app/globals.css` | 디자인 토큰 |

### 설치 후 의존성

```bash
npm install class-variance-authority clsx tailwind-merge
```

---

## 브랜드 커스터마이징

`/src/app/globals.css`에서 Primary Color만 변경:

```css
:root {
  --primary: hsl(YOUR_HUE YOUR_SATURATION% YOUR_LIGHTNESS%);
}
```

---

## 사용 가능한 컴포넌트

```tsx
import {
  Button, Input, Badge,
  Container, Section, Stack, HStack, VStack, Grid, Divider,
  Heading, Text,
  Card, CardHeader, CardContent, CardFooter,
  Avatar, AvatarGroup, IconBox,
} from "@/components/ui"
```

---

## 핵심 규칙 요약

| 항목 | 규칙 |
|-----|------|
| 버튼 | `default`, `outline` 기본 / `destructive`, `ghost` 요청 시만 |
| 토큰 | 하드코딩 금지 (`bg-[#xxx]` ❌) |
| i18n | `/src/lib/text-config.ts` 사용, 한글 하드코딩 금지 |
| 응답 | 설계 요약 (3~5줄) + 코드 / 문서 자동 생성 금지 |

---

## 상세 가이드

설치 후 각 디렉토리의 `claude.md`가 자동 로드됩니다:

- `/claude.md` → 전역 원칙, 버튼 규칙, 접근성, 네이밍
- `/src/components/claude.md` → 컴포넌트 분류, 모달 상태도
- `/src/lib/claude.md` → 유틸리티, 권한 시스템, i18n
- `/src/features/claude.md` → Feature 구조, SID/LID/BTN 체계

---

## 요구사항

- Next.js 15+ / React 19+ / Tailwind CSS 4+ / shadcn/ui (new-york)
