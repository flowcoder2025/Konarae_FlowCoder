"use client";

/**
 * Global Error Handler for Root Layout
 * Catches errors that bubble up to the root layout
 */

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error
    console.error("[Global Error Handler]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="flex justify-center">
              <AlertCircle className="h-16 w-16 text-red-500" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold">심각한 오류가 발생했습니다</h1>
              <p className="text-gray-600">
                애플리케이션을 로드하는 중 오류가 발생했습니다. 페이지를
                새로고침해주세요.
              </p>
            </div>

            <button
              onClick={reset}
              className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              새로고침
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
