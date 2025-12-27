/**
 * PullToRefresh Component
 *
 * 모바일에서 당겨서 새로고침 UI를 제공하는 래퍼 컴포넌트
 * - 당김 인디케이터 표시
 * - 새로고침 스피너 표시
 * - 부드러운 애니메이션
 */

"use client";

import { ReactNode } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  /** 자식 컴포넌트 (스크롤 가능한 콘텐츠) */
  children: ReactNode;
  /** 새로고침 콜백 함수 */
  onRefresh: () => Promise<void>;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 컨테이너 className */
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const { isRefreshing, pullProgress, containerRef } = usePullToRefresh({
    onRefresh,
    disabled,
    threshold: 80,
    maxPullDistance: 120,
  });

  const showIndicator = pullProgress > 0 || isRefreshing;
  const indicatorOpacity = Math.min(pullProgress * 1.5, 1);
  const indicatorTranslate = isRefreshing ? 40 : pullProgress * 60;
  const indicatorRotation = pullProgress * 180;

  return (
    <div className={cn("relative", className)}>
      {/* Pull Indicator */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center transition-all duration-200",
          showIndicator ? "pointer-events-auto" : "pointer-events-none"
        )}
        style={{
          top: indicatorTranslate - 40,
          opacity: indicatorOpacity,
        }}
      >
        <div
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full bg-background border shadow-md",
            isRefreshing && "animate-pulse"
          )}
        >
          <RefreshCw
            className={cn(
              "w-5 h-5 text-primary transition-transform duration-200",
              isRefreshing && "animate-spin"
            )}
            style={{
              transform: isRefreshing
                ? undefined
                : `rotate(${indicatorRotation}deg)`,
            }}
          />
        </div>
      </div>

      {/* Scrollable Container */}
      <div
        ref={containerRef}
        className={cn(
          "h-full overflow-y-auto overscroll-y-contain transition-transform duration-200",
          showIndicator && !isRefreshing && "ease-out"
        )}
        style={{
          transform:
            pullProgress > 0 ? `translateY(${indicatorTranslate}px)` : undefined,
        }}
      >
        {children}
      </div>

      {/* Refresh Status Text (optional, shown during refresh) */}
      {isRefreshing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
          <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-full">
            새로고침 중...
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * PullToRefreshWrapper
 *
 * 페이지 전체를 감싸는 Pull-to-Refresh 래퍼
 * 모바일에서만 활성화됩니다.
 */
interface PullToRefreshWrapperProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

export function PullToRefreshWrapper({
  children,
  onRefresh,
  className,
}: PullToRefreshWrapperProps) {
  // 데스크탑에서는 비활성화 (터치 디바이스 감지)
  const isTouchDevice =
    typeof window !== "undefined" && "ontouchstart" in window;

  if (!isTouchDevice) {
    return <div className={className}>{children}</div>;
  }

  return (
    <PullToRefresh onRefresh={onRefresh} className={className}>
      {children}
    </PullToRefresh>
  );
}
