"use client";

/**
 * App Route Group Error Page
 * Catches errors in authenticated user routes
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, LayoutDashboard, RefreshCcw } from "lucide-react";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "app-error-boundary" });

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("App route error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">문제가 발생했습니다</h1>
          <p className="text-muted-foreground">
            페이지를 불러오는 중 오류가 발생했습니다. 다시 시도하거나
            대시보드로 이동해주세요.
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
            onClick={() => (window.location.href = "/dashboard")}
            variant="outline"
            className="flex-1"
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            대시보드
          </Button>
        </div>
      </div>
    </div>
  );
}
