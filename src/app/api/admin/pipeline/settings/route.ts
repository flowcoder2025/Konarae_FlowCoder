/**
 * Pipeline Settings API
 * GET /api/admin/pipeline/settings - Get all settings
 * PATCH /api/admin/pipeline/settings - Update a setting
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PipelineSettingResponse {
  id: string;
  type: string;
  enabled: boolean;
  schedule: string | null;
  batchSize: number;
  maxRetries: number;
  timeout: number;
  options: Record<string, unknown> | null;
  updatedAt: string;
}

// Default settings for initialization
const DEFAULT_SETTINGS = [
  {
    type: "crawl",
    enabled: true,
    schedule: "0 16 * * *", // KST 01:00
    batchSize: 10,
    maxRetries: 3,
    timeout: 300000, // 5 minutes
    options: {},
  },
  {
    type: "parse",
    enabled: true,
    schedule: "30 16 * * *", // KST 01:30
    batchSize: 50,
    maxRetries: 3,
    timeout: 120000, // 2 minutes per file
    options: {},
  },
  {
    type: "embed",
    enabled: true,
    schedule: "0 20 * * *", // KST 05:00
    batchSize: 50,
    maxRetries: 3,
    timeout: 300000, // 5 minutes
    options: {},
  },
];

/**
 * GET - Retrieve all pipeline settings
 */
export async function GET() {
  try {
    // Get existing settings
    let settings = await prisma.pipelineSetting.findMany({
      orderBy: { type: "asc" },
    });

    // Initialize default settings if none exist
    if (settings.length === 0) {
      await prisma.pipelineSetting.createMany({
        data: DEFAULT_SETTINGS,
        skipDuplicates: true,
      });

      settings = await prisma.pipelineSetting.findMany({
        orderBy: { type: "asc" },
      });
    }

    // Ensure all types have settings
    const existingTypes = new Set(settings.map((s) => s.type));
    const missingTypes = DEFAULT_SETTINGS.filter((d) => !existingTypes.has(d.type));

    if (missingTypes.length > 0) {
      await prisma.pipelineSetting.createMany({
        data: missingTypes,
        skipDuplicates: true,
      });

      settings = await prisma.pipelineSetting.findMany({
        orderBy: { type: "asc" },
      });
    }

    const response: PipelineSettingResponse[] = settings.map((s) => ({
      id: s.id,
      type: s.type,
      enabled: s.enabled,
      schedule: s.schedule,
      batchSize: s.batchSize,
      maxRetries: s.maxRetries,
      timeout: s.timeout,
      options: s.options as Record<string, unknown> | null,
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Pipeline settings GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update a pipeline setting
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, enabled, schedule, batchSize, maxRetries, timeout, options } = body;

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    // Validate type
    const validTypes = ["crawl", "parse", "embed"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate schedule if provided
    if (schedule !== undefined && schedule !== null) {
      if (!isValidCronExpression(schedule)) {
        return NextResponse.json(
          { error: "Invalid cron expression" },
          { status: 400 }
        );
      }
    }

    // Validate numeric values
    if (batchSize !== undefined && (batchSize < 1 || batchSize > 1000)) {
      return NextResponse.json(
        { error: "batchSize must be between 1 and 1000" },
        { status: 400 }
      );
    }

    if (maxRetries !== undefined && (maxRetries < 0 || maxRetries > 10)) {
      return NextResponse.json(
        { error: "maxRetries must be between 0 and 10" },
        { status: 400 }
      );
    }

    if (timeout !== undefined && (timeout < 10000 || timeout > 3600000)) {
      return NextResponse.json(
        { error: "timeout must be between 10000 (10s) and 3600000 (1h)" },
        { status: 400 }
      );
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (enabled !== undefined) updateData.enabled = enabled;
    if (schedule !== undefined) updateData.schedule = schedule;
    if (batchSize !== undefined) updateData.batchSize = batchSize;
    if (maxRetries !== undefined) updateData.maxRetries = maxRetries;
    if (timeout !== undefined) updateData.timeout = timeout;
    if (options !== undefined) updateData.options = options;

    // Upsert setting
    const setting = await prisma.pipelineSetting.upsert({
      where: { type },
      create: {
        type,
        enabled: enabled ?? true,
        schedule: schedule ?? null,
        batchSize: batchSize ?? 50,
        maxRetries: maxRetries ?? 3,
        timeout: timeout ?? 300000,
        options: options ?? {},
      },
      update: updateData,
    });

    const response: PipelineSettingResponse = {
      id: setting.id,
      type: setting.type,
      enabled: setting.enabled,
      schedule: setting.schedule,
      batchSize: setting.batchSize,
      maxRetries: setting.maxRetries,
      timeout: setting.timeout,
      options: setting.options as Record<string, unknown> | null,
      updatedAt: setting.updatedAt.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Pipeline settings PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Basic cron expression validation
 */
function isValidCronExpression(expression: string): boolean {
  // Simple validation: 5 space-separated parts
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  // Each part should be a valid cron field
  const patterns = [
    /^(\*|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*)(\/[0-9]{1,2})?$/, // minute
    /^(\*|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*)(\/[0-9]{1,2})?$/, // hour
    /^(\*|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*)(\/[0-9]{1,2})?$/, // day of month
    /^(\*|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*)(\/[0-9]{1,2})?$/, // month
    /^(\*|[0-7](-[0-7])?(,[0-7](-[0-7])?)*)(\/[0-7])?$/, // day of week
  ];

  return parts.every((part, i) => patterns[i].test(part));
}
