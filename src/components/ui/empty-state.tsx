/**
 * Empty State Component
 *
 * 데이터가 없을 때 표시하는 빈 상태 UI
 * - 아이콘 + 제목 + 설명 + 액션 버튼
 */

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Inbox,
  FileText,
  Building2,
  Search,
  FolderKanban,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

export type EmptyStateVariant =
  | "default"
  | "projects"
  | "companies"
  | "documents"
  | "matching"
  | "search";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

const variantConfig: Record<
  EmptyStateVariant,
  {
    icon: LucideIcon;
    title: string;
    description: string;
  }
> = {
  default: {
    icon: Inbox,
    title: "데이터가 없습니다",
    description: "아직 등록된 데이터가 없습니다.",
  },
  projects: {
    icon: FolderKanban,
    title: "진행 중인 프로젝트가 없습니다",
    description: "지원사업을 찾아 프로젝트를 시작해보세요.",
  },
  companies: {
    icon: Building2,
    title: "등록된 기업이 없습니다",
    description: "기업 정보를 등록하면 맞춤 추천을 받을 수 있어요.",
  },
  documents: {
    icon: FileText,
    title: "등록된 문서가 없습니다",
    description: "기업 증빙 서류를 업로드해주세요.",
  },
  matching: {
    icon: Sparkles,
    title: "매칭 결과가 없습니다",
    description: "기업 정보를 등록하면 맞춤 지원사업을 추천해드려요.",
  },
  search: {
    icon: Search,
    title: "검색 결과가 없습니다",
    description: "다른 검색어로 다시 시도해보세요.",
  },
};

export function EmptyState({
  variant = "default",
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const config = variantConfig[variant];
  const Icon = icon || config.icon;
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold mb-2">{displayTitle}</h3>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {displayDescription}
      </p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            action.href ? (
              <Button asChild variant={action.variant || "default"}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button
                variant={action.variant || "default"}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Button asChild variant={secondaryAction.variant || "outline"}>
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button
                variant={secondaryAction.variant || "outline"}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline Empty State
 * 더 작은 크기의 인라인 빈 상태
 */
export function InlineEmptyState({
  icon,
  message,
  className,
}: {
  icon?: LucideIcon;
  message: string;
  className?: string;
}) {
  const Icon = icon || Inbox;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-8 text-muted-foreground",
        className
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
