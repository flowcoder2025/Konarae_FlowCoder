"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// 알려진 라벨 키워드 (볼드로 변환) - AI 분석 전 fallback용
const KNOWN_LABELS = [
  "소관부처·지자체",
  "소관부처",
  "지자체",
  "사업수행기관",
  "수행기관",
  "신청기간",
  "접수기간",
  "모집기간",
  "사업기간",
  "사업개요",
  "사업내용",
  "사업목적",
  "지원대상",
  "지원조건",
  "신청자격",
  "참여자격",
  "지원내용",
  "지원규모",
  "지원금액",
  "사업신청 방법",
  "사업신청방법",
  "신청방법",
  "신청절차",
  "접수방법",
  "제출서류",
  "구비서류",
  "필요서류",
  "문의처",
  "담당부서",
  "연락처",
  "사업신청 사이트",
  "신청사이트",
  "홈페이지",
];

/**
 * Plain text에서 알려진 라벨을 볼드로 변환
 * AI 분석이 완료되지 않은 fallback 콘텐츠에만 적용
 */
function preprocessContent(content: string): string {
  let processed = content;

  // 각 라벨을 볼드로 변환 (줄 시작 또는 줄바꿈 후에 있는 경우)
  KNOWN_LABELS.forEach((label) => {
    // 라벨이 줄의 시작에 있고, 그 다음에 줄바꿈이나 다른 내용이 있는 경우
    const regex = new RegExp(`(^|\\n)(${label})(?=\\s|\\n|$)`, "g");
    processed = processed.replace(regex, "$1**$2**");
  });

  return processed;
}

interface ProjectDescriptionRendererProps {
  /** AI 분석된 마크다운 (우선 사용) */
  markdownContent?: string | null;
  /** 원본 크롤링 콘텐츠 (fallback) */
  content: string;
  className?: string;
  collapsible?: boolean;
  collapsedHeight?: number;
}

/**
 * 지원사업 상세 내용 렌더러
 * - Markdown 렌더링 지원 (테이블, 리스트, 링크 등)
 * - 프로젝트 스타일링 적용
 */
export function ProjectDescriptionRenderer({
  markdownContent,
  content,
  className,
}: ProjectDescriptionRendererProps) {
  // AI 분석된 마크다운 우선 사용, 없으면 원본 콘텐츠 사용
  const displayContent = markdownContent || content;
  // AI 분석이 안된 경우에만 전처리 적용
  const isAIAnalyzed = !!markdownContent;

  if (!displayContent) {
    return null;
  }


  const proseClasses = cn(
    // Base prose styling
    "prose prose-sm max-w-none dark:prose-invert",
    // Headings
    "prose-headings:font-semibold prose-headings:text-foreground",
    "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
    "prose-headings:mt-6 prose-headings:mb-3",
    // Paragraphs
    "prose-p:text-muted-foreground prose-p:leading-relaxed",
    "prose-p:my-2",
    // Lists
    "prose-ul:my-2 prose-ol:my-2",
    "prose-li:text-muted-foreground prose-li:my-0.5",
    "prose-li:marker:text-muted-foreground/70",
    // Tables
    "prose-table:text-sm",
    "prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium",
    "prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border",
    // Links
    "prose-a:text-primary prose-a:underline-offset-2 hover:prose-a:text-primary/80",
    // Strong/Bold
    "prose-strong:text-foreground prose-strong:font-semibold",
    // Code
    "prose-code:text-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
    // Blockquotes
    "prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:not-italic",
    // Horizontal rules
    "prose-hr:border-border prose-hr:my-6",
    className
  );

  return (
    <div className="relative">
      <div className={proseClasses}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom table wrapper for horizontal scroll on mobile
            table: ({ children, ...props }) => (
              <div className="-mx-1 overflow-x-auto">
                <table {...props} className="min-w-full">
                  {children}
                </table>
              </div>
            ),
            // External links open in new tab
            a: ({ href, children, ...props }) => {
              const isExternal = href?.startsWith("http");
              return (
                <a
                  href={href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  {...props}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {isAIAnalyzed ? displayContent : preprocessContent(displayContent)}
        </ReactMarkdown>
      </div>
    </div>
  );
}
