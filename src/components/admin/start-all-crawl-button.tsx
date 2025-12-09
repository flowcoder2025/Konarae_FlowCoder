/**
 * Start All Crawl Button - Client Component
 * Trigger crawling for all active sources at once
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startAllCrawl } from "@/lib/actions/admin-actions";

type Props = {
  activeSourceCount: number;
};

export function StartAllCrawlButton({ activeSourceCount }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartAllCrawl = async () => {
    if (activeSourceCount === 0) {
      toast.error("활성화된 크롤링 소스가 없습니다");
      return;
    }

    setIsLoading(true);
    try {
      const result = await startAllCrawl();

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("전체 크롤링 시작 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleStartAllCrawl}
      disabled={isLoading || activeSourceCount === 0}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <PlayCircle className="h-4 w-4" />
      )}
      {isLoading ? "크롤링 시작 중..." : `전체 크롤링 (${activeSourceCount}개)`}
    </Button>
  );
}
