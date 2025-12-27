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
