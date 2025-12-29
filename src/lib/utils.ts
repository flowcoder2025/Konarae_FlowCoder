import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 클래스 병합 유틸리티
 * Tailwind CSS 클래스를 안전하게 병합합니다.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 서울 타임존(KST) 날짜 포맷 유틸리티
 * 서버/클라이언트 환경에 관계없이 항상 Asia/Seoul 타임존으로 표시합니다.
 */
const SEOUL_TIMEZONE = "Asia/Seoul"

/**
 * 날짜를 서울 시간으로 포맷합니다. (예: 2025. 12. 11.)
 */
export function formatDateKST(date: Date | string | null): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("ko-KR", { timeZone: SEOUL_TIMEZONE })
}

/**
 * 날짜와 시간을 서울 시간으로 포맷합니다. (예: 2025. 12. 11. 오후 3:30:00)
 */
export function formatDateTimeKST(date: Date | string | null): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("ko-KR", { timeZone: SEOUL_TIMEZONE })
}

/**
 * 날짜와 시간을 짧은 형식으로 서울 시간으로 포맷합니다. (예: 12/11 15:30)
 */
export function formatDateTimeShortKST(date: Date | string | null): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("ko-KR", {
    timeZone: SEOUL_TIMEZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * 마감일까지 남은 일수를 계산합니다.
 * @param deadline - 마감일 (Date, string, null)
 * @returns 남은 일수 (양수). 이미 지난 경우 null 반환
 */
export function calculateDaysLeft(deadline: Date | string | null): number | null {
  if (!deadline) return null
  const d = typeof deadline === "string" ? new Date(deadline) : deadline
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return days > 0 ? days : null
}

/**
 * URL에서 도메인 이름을 추출하고 가독성 있게 변환
 * @param url - 소스 URL
 * @returns 도메인 기반 출처 이름 (예: "K-Startup", "bizinfo.go.kr")
 */
function extractSourceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname
    // 알려진 소스 매핑
    const sourceMap: Record<string, string> = {
      "www.k-startup.go.kr": "K-Startup",
      "k-startup.go.kr": "K-Startup",
      "www.bizinfo.go.kr": "기업마당",
      "bizinfo.go.kr": "기업마당",
      "www.mss.go.kr": "중소벤처기업부",
      "mss.go.kr": "중소벤처기업부",
      "www.kised.or.kr": "창업진흥원",
      "kised.or.kr": "창업진흥원",
      "www.kodit.co.kr": "신용보증기금",
      "kodit.co.kr": "신용보증기금",
      "www.kosmes.or.kr": "중소벤처기업진흥공단",
      "kosmes.or.kr": "중소벤처기업진흥공단",
    }
    return sourceMap[hostname] || hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * 기관명이 유효한지 검사하고, 숫자만 있거나 빈 값이면 소스URL에서 추출하거나 기본값 반환
 * @param org - 기관명 (string, null, undefined)
 * @param sourceUrl - 크롤링 소스 URL (optional)
 * @param fallback - 기본값 (default: "기관 미정")
 * @returns 유효한 기관명 또는 소스 출처 또는 기본값
 */
export function formatOrganization(
  org: string | null | undefined,
  sourceUrl?: string | null,
  fallback = "기관 미정"
): string {
  if (org && org.trim() !== "" && !/^\d+$/.test(org.trim())) {
    return org
  }
  // 기관명이 유효하지 않으면 소스URL에서 추출 시도
  const sourceFromUrl = extractSourceFromUrl(sourceUrl)
  if (sourceFromUrl) {
    return sourceFromUrl
  }
  return fallback
}
