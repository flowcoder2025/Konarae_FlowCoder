"use client";

/**
 * Global Error Page
 * Catches errors in Next.js App Router
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, RefreshCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Global Error]", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">문제가 발생했습니다</h1>
          <p className="text-muted-foreground">
            일시적인 오류가 발생했습니다. 페이지를 새로고침하거나 잠시 후 다시
            시도해주세요.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="rounded-lg bg-destructive/10 p-4 text-left">
            <p className="font-mono text-sm text-destructive">
              {error.message}
            </p>
            {error.digest && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={reset} className="flex-1">
            <RefreshCcw className="mr-2 h-4 w-4" />
            다시 시도
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="outline"
            className="flex-1"
          >
            <Home className="mr-2 h-4 w-4" />
            홈으로
          </Button>
        </div>
      </div>
    </div>
  );
}
