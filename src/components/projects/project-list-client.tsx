/**
 * ProjectListClient Component
 *
 * 프로젝트 목록의 클라이언트 래퍼
 * Pull-to-Refresh 기능을 제공합니다.
 */

"use client";

import { ReactNode, useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

interface ProjectListClientProps {
  children: ReactNode;
}

export function ProjectListClient({ children }: ProjectListClientProps) {
  const router = useRouter();
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

  const handleRefresh = useCallback(async () => {
    // 데이터 새로고침을 위해 라우터 리프레시 호출
    router.refresh();
    // 약간의 딜레이를 주어 사용자에게 새로고침이 완료되었음을 보여줌
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, [router]);

  if (!isTouchDevice) {
    return <>{children}</>;
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-[50vh]">
      {children}
    </PullToRefresh>
  );
}
