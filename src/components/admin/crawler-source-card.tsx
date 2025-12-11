/**
 * Crawler Source Card - Client Component
 * Display and control crawl source with start crawl action
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { startCrawl } from "@/lib/actions/admin-actions";
import { formatDateTimeKST } from "@/lib/utils";

type CrawlSource = {
  id: string;
  name: string;
  url: string;
  type: string;
  isActive: boolean;
  lastCrawled: Date | null;
};

type Props = {
  source: CrawlSource;
};

export function CrawlerSourceCard({ source }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartCrawl = async () => {
    if (!source.isActive) return;

    setIsLoading(true);
    try {
      const result = await startCrawl(source.id);

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("크롤링 시작 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{source.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {source.type === "api" ? "API" : "웹"}
            </p>
          </div>
          <Badge variant={source.isActive ? "default" : "outline"}>
            {source.isActive ? "활성" : "비활성"}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground truncate">
          {source.url}
        </div>

        {source.lastCrawled && (
          <div className="text-xs text-muted-foreground">
            마지막 크롤링: {formatDateTimeKST(source.lastCrawled)}
          </div>
        )}

        <Button
          size="sm"
          className="w-full"
          disabled={!source.isActive || isLoading}
          onClick={handleStartCrawl}
        >
          <Play className="mr-2 h-4 w-4" />
          {isLoading ? "시작 중..." : "크롤링"}
        </Button>
      </div>
    </Card>
  );
}
