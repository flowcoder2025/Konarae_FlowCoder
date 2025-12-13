"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface MatchFiltersProps {
  companies: Array<{ id: string; name: string }>;
}

const CONFIDENCE_OPTIONS = [
  { value: "all", label: "전체 적합도" },
  { value: "high", label: "높은 적합도" },
  { value: "medium", label: "중간 적합도" },
  { value: "low", label: "낮은 적합도" },
] as const;

const SORT_OPTIONS = [
  { value: "score", label: "점수 높은 순" },
  { value: "score_asc", label: "점수 낮은 순" },
  { value: "date", label: "최신순" },
  { value: "deadline", label: "마감일 임박순" },
] as const;

export function MatchFilters({ companies }: MatchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCompanyId = searchParams.get("companyId") || "all";
  const currentConfidence = searchParams.get("confidence") || "all";
  const currentSort = searchParams.get("sort") || "score";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);

    if (value === "all" || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    // Reset to page 1 when filters change
    params.delete("page");

    router.push(`/matching/results?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("/matching/results");
  };

  const hasActiveFilters =
    currentCompanyId !== "all" ||
    currentConfidence !== "all" ||
    currentSort !== "score";

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Company Filter */}
        <div className="flex-1 min-w-[200px]">
          <Select value={currentCompanyId} onValueChange={(value) => updateFilter("companyId", value)}>
            <SelectTrigger>
              <SelectValue placeholder="기업 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기업</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Confidence Filter */}
        <div className="flex gap-2">
          {CONFIDENCE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={currentConfidence === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => updateFilter("confidence", option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Sort */}
        <div className="min-w-[180px]">
          <Select value={currentSort} onValueChange={(value) => updateFilter("sort", value)}>
            <SelectTrigger>
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            필터 초기화
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {currentCompanyId !== "all" && (
            <Badge variant="outline">
              기업: {companies.find((c) => c.id === currentCompanyId)?.name}
            </Badge>
          )}
          {currentConfidence !== "all" && (
            <Badge variant="outline">
              적합도: {CONFIDENCE_OPTIONS.find((o) => o.value === currentConfidence)?.label}
            </Badge>
          )}
          {currentSort !== "score" && (
            <Badge variant="outline">
              정렬: {SORT_OPTIONS.find((o) => o.value === currentSort)?.label}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
