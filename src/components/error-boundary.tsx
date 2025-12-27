"use client";

/**
 * Global Error Boundary Component
 * Catches React errors and displays user-friendly fallback UI
 * Includes structured error logging for production monitoring
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

/**
 * 구조화된 에러 로그 인터페이스
 */
interface ErrorLog {
  timestamp: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  env: string;
}

/**
 * 에러 추적 서비스 인터페이스
 * Sentry, LogRocket 등 외부 서비스 연동 시 이 인터페이스 구현
 */
interface ErrorTracker {
  captureException: (error: Error, context?: Record<string, unknown>) => void;
}

// 기본 에러 추적기 (콘솔 로깅 + API 전송)
const defaultErrorTracker: ErrorTracker = {
  captureException: (error: Error, context?: Record<string, unknown>) => {
    const errorLog: ErrorLog = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      componentStack: context?.componentStack as string | undefined,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      env: process.env.NODE_ENV || "development",
    };

    // 콘솔에 구조화된 로그 출력
    console.error("[ErrorBoundary] Error captured:", errorLog);

    // 프로덕션에서 API로 에러 전송 (비동기, fire-and-forget)
    if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
      // 에러 로깅 API가 있다면 전송
      // fetch("/api/log/error", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(errorLog),
      // }).catch(() => {});

      // 또는 Sentry SDK가 설정되어 있다면:
      // Sentry.captureException(error, { extra: context });
    }
  },
};

// 사용할 에러 추적기 (환경 변수로 설정 가능)
let errorTracker: ErrorTracker = defaultErrorTracker;

/**
 * 외부 에러 추적 서비스 설정
 * @example setErrorTracker(Sentry)
 */
export function setErrorTracker(tracker: ErrorTracker) {
  errorTracker = tracker;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    }

    // TODO: Send error to logging service (Sentry, LogRocket, etc.)
    this.logErrorToService(error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  logErrorToService = (error: Error, errorInfo: React.ErrorInfo) => {
    // 구조화된 에러 추적 서비스로 전송
    errorTracker.captureException(error, {
      componentStack: errorInfo.componentStack,
    });
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="flex justify-center">
              <AlertCircle className="h-16 w-16 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">문제가 발생했습니다</h1>
              <p className="text-muted-foreground">
                일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="rounded-lg bg-destructive/10 p-4 text-left">
                <p className="font-mono text-sm text-destructive">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={this.handleReset} className="flex-1">
                다시 시도
              </Button>
              <Button
                onClick={() => (window.location.href = "/")}
                variant="outline"
                className="flex-1"
              >
                홈으로
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary for functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return setError;
}
