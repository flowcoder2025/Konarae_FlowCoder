/**
 * Example API Route with Error Handling
 * This demonstrates best practices for API error handling
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APIErrors, handleAPIError } from "@/lib/api-error";
import { createLogger } from "@/lib/logger";
import { z } from "zod";

// Request validation schema
const exampleSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
});

/**
 * GET /api/example
 * Example GET endpoint with proper error handling
 */
export async function GET(req: NextRequest) {
  const logger = createLogger({ method: "GET", path: "/api/example" });

  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      throw APIErrors.unauthorized();
    }

    logger.info("Processing request", { userId: session.user.id });

    // 2. Business logic
    const data = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!data) {
      throw APIErrors.notFound("사용자");
    }

    // 3. Success response
    logger.info("Request completed successfully");
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    // Centralized error handling
    logger.error("Request failed", error as Error);
    return handleAPIError(error, req.url);
  }
}

/**
 * POST /api/example
 * Example POST endpoint with validation
 */
export async function POST(req: NextRequest) {
  const logger = createLogger({ method: "POST", path: "/api/example" });

  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      throw APIErrors.unauthorized();
    }

    // 2. Request body parsing
    const body = await req.json();

    // 3. Validation
    const validated = exampleSchema.parse(body);

    logger.info("Creating resource", {
      userId: session.user.id,
      data: validated,
    });

    // 4. Database operation
    const created = await prisma.user.create({
      data: {
        email: validated.email,
        name: validated.name,
      },
    });

    // 5. Success response
    logger.info("Resource created successfully", { id: created.id });
    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Request failed", error as Error);
    return handleAPIError(error, req.url);
  }
}
