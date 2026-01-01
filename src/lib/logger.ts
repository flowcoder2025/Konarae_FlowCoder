/**
 * Centralized Logging Utility
 * Structured logging with context and levels
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  userId?: string;
  companyId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  error?: unknown;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry, null, this.isDevelopment ? 2 : 0);
  }

  private shouldLog(level: LogLevel): boolean {
    const logLevel = process.env.LOG_LEVEL || (this.isDevelopment ? "debug" : "info");
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(logLevel as LogLevel);
  }

  debug(message: string, context?: LogContext) {
    if (this.shouldLog("debug")) {
      const entry: LogEntry = {
        level: "debug",
        message,
        timestamp: new Date().toISOString(),
        context,
      };
      console.log(this.formatLog(entry));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.shouldLog("info")) {
      const entry: LogEntry = {
        level: "info",
        message,
        timestamp: new Date().toISOString(),
        context,
      };
      console.log(this.formatLog(entry));
    }
  }

  warn(message: string, context?: LogContext) {
    if (this.shouldLog("warn")) {
      const entry: LogEntry = {
        level: "warn",
        message,
        timestamp: new Date().toISOString(),
        context,
      };
      console.warn(this.formatLog(entry));
    }
  }

  error(message: string, errorOrContext?: Error | LogContext, context?: LogContext) {
    if (this.shouldLog("error")) {
      // Handle both signatures:
      // error(message, Error, context?) or error(message, contextWithError)
      let err: Error | undefined;
      let ctx: LogContext | undefined;

      if (errorOrContext instanceof Error) {
        err = errorOrContext;
        ctx = context;
      } else if (errorOrContext) {
        ctx = errorOrContext;
        // Extract error from context if provided
        if (ctx.error instanceof Error) {
          err = ctx.error;
        } else if (ctx.error) {
          // Convert unknown error to Error-like object
          err = new Error(String(ctx.error));
        }
      }

      const entry: LogEntry = {
        level: "error",
        message,
        timestamp: new Date().toISOString(),
        context: ctx,
        error: err
          ? {
              name: err.name,
              message: err.message,
              stack: this.isDevelopment ? err.stack : undefined,
            }
          : undefined,
      };
      console.error(this.formatLog(entry));

      // Send to error tracking service in production
      if (!this.isDevelopment && err) {
        this.sendToErrorTracking(entry);
      }
    }
  }

  private sendToErrorTracking(_entry: LogEntry) {
    // 에러 추적 서비스 통합 예정 (Sentry, LogRocket 등)
    // 서비스 선택 후 구현: Sentry.captureException(_entry.error);
    // 현재는 console 로그만 사용 (production에서 자동 로깅)
  }
}

export const logger = new Logger();

/**
 * Create logger with context (useful for API routes)
 */
export function createLogger(baseContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      logger.debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      logger.info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      logger.warn(message, { ...baseContext, ...context }),
    error: (message: string, errorOrContext?: Error | LogContext, context?: LogContext) => {
      if (errorOrContext instanceof Error) {
        logger.error(message, errorOrContext, { ...baseContext, ...context });
      } else {
        logger.error(message, { ...baseContext, ...errorOrContext, ...context });
      }
    },
  };
}
