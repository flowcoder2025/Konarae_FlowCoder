/**
 * API Error Handling Utilities
 * Centralized error handling for API routes
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

/**
 * Handle API errors and return standardized NextResponse
 */
export function handleAPIError(
  error: unknown,
  path?: string
): NextResponse<ErrorResponse> {
  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("[API Error]", error);
  }

  // Validation errors (Zod)
  if (error instanceof ZodError) {
    return NextResponse.json<ErrorResponse>(
      {
        error: "Validation Error",
        message: "요청 데이터가 올바르지 않습니다",
        code: "VALIDATION_ERROR",
        details: error.errors,
        timestamp: new Date().toISOString(),
        path,
      },
      { status: 400 }
    );
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error, path);
  }

  // Custom API errors
  if (error instanceof APIError) {
    return NextResponse.json<ErrorResponse>(
      {
        error: error.name,
        message: error.message,
        code: error.code,
        details: error.details,
        timestamp: new Date().toISOString(),
        path,
      },
      { status: error.statusCode }
    );
  }

  // Generic errors
  const message =
    error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다";

  return NextResponse.json<ErrorResponse>(
    {
      error: "Internal Server Error",
      message,
      timestamp: new Date().toISOString(),
      path,
    },
    { status: 500 }
  );
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  path?: string
): NextResponse<ErrorResponse> {
  let message = "데이터베이스 오류가 발생했습니다";
  let statusCode = 500;

  switch (error.code) {
    case "P2002":
      // Unique constraint violation
      message = "이미 존재하는 데이터입니다";
      statusCode = 409;
      break;
    case "P2025":
      // Record not found
      message = "요청한 데이터를 찾을 수 없습니다";
      statusCode = 404;
      break;
    case "P2003":
      // Foreign key constraint violation
      message = "관련 데이터가 존재하지 않습니다";
      statusCode = 400;
      break;
    case "P2014":
      // Required relation violation
      message = "필수 관계가 충족되지 않았습니다";
      statusCode = 400;
      break;
  }

  return NextResponse.json<ErrorResponse>(
    {
      error: "Database Error",
      message,
      code: error.code,
      details: process.env.NODE_ENV === "development" ? error.meta : undefined,
      timestamp: new Date().toISOString(),
      path,
    },
    { status: statusCode }
  );
}

/**
 * Common API error constructors
 */
export const APIErrors = {
  unauthorized: (message = "인증이 필요합니다") =>
    new APIError(message, 401, "UNAUTHORIZED"),

  forbidden: (message = "권한이 없습니다") =>
    new APIError(message, 403, "FORBIDDEN"),

  notFound: (resource = "리소스") =>
    new APIError(`${resource}를 찾을 수 없습니다`, 404, "NOT_FOUND"),

  badRequest: (message = "잘못된 요청입니다") =>
    new APIError(message, 400, "BAD_REQUEST"),

  conflict: (message = "요청이 현재 상태와 충돌합니다") =>
    new APIError(message, 409, "CONFLICT"),

  tooManyRequests: (message = "너무 많은 요청이 발생했습니다") =>
    new APIError(message, 429, "TOO_MANY_REQUESTS"),

  internal: (message = "서버 오류가 발생했습니다") =>
    new APIError(message, 500, "INTERNAL_ERROR"),
};

/**
 * Async error wrapper for API route handlers
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleAPIError(error, args[0]?.url);
    }
  }) as T;
}
