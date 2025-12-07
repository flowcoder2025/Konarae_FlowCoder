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

  error(message: string, error?: Error, context?: LogContext) {
    if (this.shouldLog("error")) {
      const entry: LogEntry = {
        level: "error",
        message,
        timestamp: new Date().toISOString(),
        context,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: this.isDevelopment ? error.stack : undefined,
            }
          : undefined,
      };
      console.error(this.formatLog(entry));

      // Send to error tracking service in production
      if (!this.isDevelopment && error) {
        this.sendToErrorTracking(entry);
      }
    }
  }

  private sendToErrorTracking(entry: LogEntry) {
    // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
    // Example: Sentry.captureException(entry.error);
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
    error: (message: string, error?: Error, context?: LogContext) =>
      logger.error(message, error, { ...baseContext, ...context }),
  };
}
