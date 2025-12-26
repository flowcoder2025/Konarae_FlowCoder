/**
 * Notification Settings API (PRD Phase 7)
 * GET /api/notifications/settings - Get settings
 * PATCH /api/notifications/settings - Update settings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "notification-settings" });

const updateSettingsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  discordEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  discordWebhookUrl: z.string().url().optional().nullable(),
  slackWebhookUrl: z.string().url().optional().nullable(),
  deadlineAlertDays: z.number().int().min(1).max(30).optional(),
  matchingResultEnabled: z.boolean().optional(),
  evaluationCompleteEnabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create notification settings
    let settings = await prisma.notificationSetting.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: {
          userId: session.user.id,
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error("Failed to get notification settings", { error });
    return NextResponse.json(
      { error: "Failed to get notification settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = updateSettingsSchema.parse(body);

    // Upsert notification settings
    const settings = await prisma.notificationSetting.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        ...validatedData,
      },
      update: validatedData,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to update notification settings", { error });
    return NextResponse.json(
      { error: "Failed to update notification settings" },
      { status: 500 }
    );
  }
}
