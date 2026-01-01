"use client";

/**
 * Admin Route Error Page
 * Catches errors in admin routes
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Shield } from "lucide-react";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "admin-error-boundary" });

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Admin route error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">관리자 페이지 오류</h1>
          <p className="text-muted-foreground">
            관리자 페이지에서 오류가 발생했습니다. 다시 시도하거나 관리자
            대시보드로 이동해주세요.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="rounded-lg bg-amber-500/10 p-4 text-left">
            <p className="font-mono text-sm text-amber-700 dark:text-amber-400">
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
            onClick={() => (window.location.href = "/admin")}
            variant="outline"
            className="flex-1"
          >
            <Shield className="mr-2 h-4 w-4" />
            관리자 홈
          </Button>
        </div>
      </div>
    </div>
  );
}
