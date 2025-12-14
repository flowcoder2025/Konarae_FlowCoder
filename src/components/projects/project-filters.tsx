"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Calendar, ArrowUpDown } from "lucide-react";

interface ProjectFiltersProps {
  categories: { value: string; count: number }[];
  regions: { value: string; count: number }[];
  currentCategory?: string;
  currentRegion?: string;
  currentSearch?: string;
  currentDeadline?: string;
  currentSort?: string;
  total: number;
}

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "deadline", label: "마감일순" },
  { value: "views", label: "조회순" },
];

const DEADLINE_OPTIONS = [
  { value: "7", label: "1주일 이내" },
  { value: "14", label: "2주일 이내" },
  { value: "30", label: "1개월 이내" },
  { value: "90", label: "3개월 이내" },
  { value: "permanent", label: "상시모집" },
];

export function ProjectFilters({
  categories,
  regions,
  currentCategory,
  currentRegion,
  currentSearch,
  currentDeadline,
  currentSort,
  total,
}: ProjectFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentSearch || "");

  const createQueryString = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      // Reset page when filters change
      if (!("page" in updates)) {
        params.delete("page");
      }

      return params.toString();
    },
    [searchParams]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = createQueryString({ search: searchInput || undefined });
    router.push(`/projects${query ? `?${query}` : ""}`);
  };

  const handleCategoryClick = (category: string) => {
    const newCategory = currentCategory === category ? undefined : category;
    const query = createQueryString({ category: newCategory });
    router.push(`/projects${query ? `?${query}` : ""}`);
  };

  const handleRegionClick = (region: string) => {
    const newRegion = currentRegion === region ? undefined : region;
    const query = createQueryString({ region: newRegion });
    router.push(`/projects${query ? `?${query}` : ""}`);
  };

  const handleDeadlineClick = (deadline: string) => {
    const newDeadline = currentDeadline === deadline ? undefined : deadline;
    const query = createQueryString({ deadline: newDeadline });
    router.push(`/projects${query ? `?${query}` : ""}`);
  };

  const handleSortClick = (sort: string) => {
    const newSort = currentSort === sort ? undefined : sort;
    const query = createQueryString({ sort: newSort });
    router.push(`/projects${query ? `?${query}` : ""}`);
  };

  const clearFilters = () => {
    setSearchInput("");
    router.push("/projects");
  };

  const hasActiveFilters =
    currentCategory ||
    currentRegion ||
    currentSearch ||
    currentDeadline ||
    (currentSort && currentSort !== "latest");

  // 카테고리별 색상 (ProjectCard와 동일)
  const getCategoryColor = (cat: string, isActive: boolean) => {
    if (!isActive) return "bg-muted text-muted-foreground hover:bg-muted/80";

    const colors: Record<string, string> = {
      인력: "bg-blue-100 text-blue-800 border-blue-300",
      수출: "bg-green-100 text-green-800 border-green-300",
      창업: "bg-purple-100 text-purple-800 border-purple-300",
      기술: "bg-orange-100 text-orange-800 border-orange-300",
      자금: "bg-yellow-100 text-yellow-800 border-yellow-300",
      판로: "bg-pink-100 text-pink-800 border-pink-300",
      경영: "bg-cyan-100 text-cyan-800 border-cyan-300",
      "R&D": "bg-indigo-100 text-indigo-800 border-indigo-300",
    };
    return colors[cat] || "bg-primary/10 text-primary border-primary/30";
  };

  return (
    <div className="mb-6 space-y-4">
      {/* Search Bar & Sort */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="지원사업 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">검색</Button>
        </form>

        {/* Sort Options */}
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5" />
            정렬:
          </span>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSortClick(option.value)}
              className={`px-3 py-1 text-sm rounded-full border transition-[background-color,border-color,color] duration-150 ${
                (currentSort || "latest") === option.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground py-1 min-w-[40px]">
            분야:
          </span>
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryClick(cat.value)}
              className={`px-3 py-1 text-sm rounded-full border transition-[background-color,border-color,color] duration-150 ${getCategoryColor(
                cat.value,
                currentCategory === cat.value
              )}`}
            >
              {cat.value} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Region Filters */}
      {regions.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground py-1 min-w-[40px]">
            지역:
          </span>
          {regions.slice(0, 10).map((region) => (
            <button
              key={region.value}
              onClick={() => handleRegionClick(region.value)}
              className={`px-3 py-1 text-sm rounded-full border transition-[background-color,border-color,color] duration-150 ${
                currentRegion === region.value
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {region.value} ({region.count})
            </button>
          ))}
        </div>
      )}

      {/* Deadline Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground py-1 min-w-[40px] flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          마감:
        </span>
        {DEADLINE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleDeadlineClick(option.value)}
            className={`px-3 py-1 text-sm rounded-full border transition-[background-color,border-color,color] duration-150 ${
              currentDeadline === option.value
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Active Filters & Count */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            총 {total}개의 지원사업
          </span>
          {hasActiveFilters && (
            <>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={clearFilters}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                필터 초기화
              </button>
            </>
          )}
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            {currentSearch && (
              <Badge variant="outline" className="gap-1">
                검색: {currentSearch}
                <button
                  onClick={() => {
                    setSearchInput("");
                    const query = createQueryString({ search: undefined });
                    router.push(`/projects${query ? `?${query}` : ""}`);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {currentCategory && (
              <Badge variant="outline" className="gap-1">
                {currentCategory}
                <button onClick={() => handleCategoryClick(currentCategory)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {currentRegion && (
              <Badge variant="outline" className="gap-1">
                {currentRegion}
                <button onClick={() => handleRegionClick(currentRegion)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {currentDeadline && (
              <Badge variant="outline" className="gap-1">
                {DEADLINE_OPTIONS.find((o) => o.value === currentDeadline)
                  ?.label || currentDeadline}
                <button onClick={() => handleDeadlineClick(currentDeadline)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
