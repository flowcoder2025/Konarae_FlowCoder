/**
 * usePullToRefresh Hook
 *
 * 모바일에서 당겨서 새로고침 기능을 제공하는 커스텀 훅
 * 터치 제스처를 감지하여 콜백 함수를 실행합니다.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface UsePullToRefreshOptions {
  /** 새로고침을 트리거하는 콜백 함수 */
  onRefresh: () => Promise<void>;
  /** 당기기 시작 임계값 (px) */
  threshold?: number;
  /** 최대 당김 거리 (px) */
  maxPullDistance?: number;
  /** 비활성화 여부 */
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  /** 현재 새로고침 중 여부 */
  isRefreshing: boolean;
  /** 현재 당김 거리 (0-1 사이 비율) */
  pullProgress: number;
  /** 스크롤 컨테이너에 연결할 ref */
  containerRef: React.RefObject<HTMLDivElement>;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPullDistance = 120,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      // 스크롤이 맨 위에 있을 때만 pull-to-refresh 활성화
      if (container.scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPullingRef.current || disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container || container.scrollTop > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0) {
        // 저항감 적용 (당길수록 더 어려워짐)
        const resistance = 0.5;
        const distance = Math.min(diff * resistance, maxPullDistance);
        setPullDistance(distance);

        // 기본 스크롤 방지
        if (diff > 10) {
          e.preventDefault();
        }
      }
    },
    [disabled, isRefreshing, maxPullDistance]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || disabled) return;

    isPullingRef.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh, disabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  const pullProgress = Math.min(pullDistance / threshold, 1);

  return {
    isRefreshing,
    pullProgress,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  };
}
