/**
 * Loading Spinner Component
 * Animated loading indicator
 */

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export function LoadingSpinner({
  size = "md",
  className,
  text,
}: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Loader2 className={cn("animate-spin", sizeClasses[size], className)} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  );
}

/**
 * Full Page Loading
 * Loading state for entire page
 */
export function PageLoader({ text = "로딩 중..." }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="xl" />
        <p className="mt-4 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

/**
 * Overlay Loading
 * Semi-transparent overlay with spinner
 */
export function OverlayLoader({
  text = "처리 중...",
  blur = false,
}: {
  text?: string;
  blur?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80",
        blur && "backdrop-blur-sm"
      )}
    >
      <div className="text-center">
        <LoadingSpinner size="xl" />
        <p className="mt-4 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

/**
 * Inline Loading
 * Small inline loading indicator
 */
export function InlineLoader({ text }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <LoadingSpinner size="sm" />
      {text && <span className="text-xs text-muted-foreground">{text}</span>}
    </div>
  );
}

/**
 * Button Loading State
 * Loading state for buttons
 */
export function ButtonLoader() {
  return <LoadingSpinner size="sm" className="mr-2" />;
}
