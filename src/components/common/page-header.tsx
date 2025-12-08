/**
 * PageHeader Component
 *
 * 페이지 상단 헤더 - 뒤로가기/목록보기 네비게이션 포함
 */

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, List } from "lucide-react";

interface PageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 부제목/설명 (optional) */
  description?: string;
  /** 뒤로가기 URL - 생략 시 router.back() 사용 */
  backHref?: string;
  /** 목록 페이지 URL (optional) */
  listHref?: string;
  /** 목록 버튼 텍스트 */
  listLabel?: string;
  /** 추가 액션 버튼 영역 */
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  backHref,
  listHref,
  listLabel = "목록",
  actions,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="mb-8">
      {/* Navigation row */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          뒤로
        </Button>

        {listHref && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link href={listHref}>
              <List className="h-4 w-4" />
              {listLabel}
            </Link>
          </Button>
        )}
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-2">{description}</p>
          )}
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
