"use client";

/**
 * Matching Filters Component
 * 매칭 결과 필터링 UI (신뢰도, 점수 범위, 검색)
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter, Download } from "lucide-react";

export function MatchingFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  // 현재 필터 값
  const confidence = searchParams.get("confidence") || "";
  const minScore = searchParams.get("minScore") || "";
  const maxScore = searchParams.get("maxScore") || "";
  const search = searchParams.get("search") || "";

  // URL 업데이트 헬퍼
  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      startTransition(() => {
        router.push(`/admin/matching?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  // 필터 초기화
  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.push("/admin/matching");
    });
  }, [router]);

  // 검색 폼 제출
  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchValue = formData.get("search") as string;
    updateFilters({ search: searchValue });
  };

  const hasFilters = confidence || minScore || maxScore || search;

  // CSV 내보내기
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // 현재 필터 조건으로 내보내기 URL 생성
      const params = new URLSearchParams();
      if (confidence) params.set("confidence", confidence);
      if (minScore) params.set("minScore", minScore);
      if (maxScore) params.set("maxScore", maxScore);
      if (search) params.set("search", search);

      const url = `/api/admin/matching/export?${params.toString()}`;

      // fetch로 CSV 다운로드
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Blob으로 변환 후 다운로드 트리거
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;

      // Content-Disposition에서 파일명 추출 또는 기본값 사용
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      link.download = filenameMatch?.[1] || "matching_results.csv";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Export error:", error);
      alert("내보내기에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsExporting(false);
    }
  }, [confidence, minScore, maxScore, search]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* 검색 */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="기업명 또는 프로젝트명 검색..."
            defaultValue={search}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          검색
        </Button>
      </form>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />

        {/* 신뢰도 필터 */}
        <Select
          value={confidence}
          onValueChange={(value) =>
            updateFilters({ confidence: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="신뢰도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="high">높음</SelectItem>
            <SelectItem value="medium">중간</SelectItem>
            <SelectItem value="low">낮음</SelectItem>
          </SelectContent>
        </Select>

        {/* 최소 점수 */}
        <Select
          value={minScore}
          onValueChange={(value) =>
            updateFilters({ minScore: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="최소 점수" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="60">60점 이상</SelectItem>
            <SelectItem value="50">50점 이상</SelectItem>
            <SelectItem value="40">40점 이상</SelectItem>
            <SelectItem value="30">30점 이상</SelectItem>
          </SelectContent>
        </Select>

        {/* 최대 점수 */}
        <Select
          value={maxScore}
          onValueChange={(value) =>
            updateFilters({ maxScore: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="최대 점수" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="100">100점 이하</SelectItem>
            <SelectItem value="70">70점 이하</SelectItem>
            <SelectItem value="50">50점 이하</SelectItem>
            <SelectItem value="30">30점 이하</SelectItem>
          </SelectContent>
        </Select>

        {/* 필터 초기화 */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            disabled={isPending}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            초기화
          </Button>
        )}

        {/* CSV 내보내기 */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          className="gap-1"
        >
          <Download className="h-4 w-4" />
          {isExporting ? "내보내는 중..." : "CSV 내보내기"}
        </Button>
      </div>
    </div>
  );
}
