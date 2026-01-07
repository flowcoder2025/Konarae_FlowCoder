"use client";

/**
 * FormattedDate - 하이드레이션 안전한 날짜 포매팅 컴포넌트
 *
 * Server Component에서 날짜를 직접 포매팅하면 서버/클라이언트 타임존 차이로
 * 하이드레이션 미스매치가 발생할 수 있습니다.
 * 이 컴포넌트는 클라이언트에서만 날짜를 포매팅하여 이 문제를 해결합니다.
 */

import { useState, useEffect } from "react";
import { formatDateTimeKST, formatDateTimeShortKST } from "@/lib/utils";

interface FormattedDateProps {
  date: Date | string | null;
  format?: "full" | "short";
  className?: string;
  fallback?: string;
}

export function FormattedDate({
  date,
  format = "full",
  className,
  fallback = "-",
}: FormattedDateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 서버 렌더링 시 placeholder 표시
  if (!mounted) {
    return <span className={className}>{fallback}</span>;
  }

  // 클라이언트에서만 날짜 포매팅
  const formatted =
    format === "short"
      ? formatDateTimeShortKST(date)
      : formatDateTimeKST(date);

  return <span className={className}>{formatted}</span>;
}
