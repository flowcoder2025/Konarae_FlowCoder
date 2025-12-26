/**
 * Deadline Alerts Cron Job (PRD Phase 7)
 * POST /api/cron/deadline-alerts - Check and send deadline alerts
 *
 * Triggered by Upstash QStash at 9:00 AM KST (00:00 UTC)
 * QStash Schedule ID: deadline-alerts-daily
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDeadlineAlert } from "@/lib/notifications";
import { verifyQStashSignature } from "@/lib/qstash";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-deadline-alerts" });

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// QStash sends POST requests
export async function POST(req: NextRequest) {
  try {
    // Verify QStash signature
    const signature = req.headers.get("upstash-signature");
    const body = await req.text();

    const isValid = await verifyQStashSignature(signature, body);
    if (!isValid) {
      logger.error("Invalid QStash signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("Deadline alerts check started");

    // Get all active notification settings
    const settings = await prisma.notificationSetting.findMany({
      where: {
        OR: [
          { emailEnabled: true },
          { discordEnabled: true },
          { slackEnabled: true },
        ],
      },
      select: {
        userId: true,
        deadlineAlertDays: true,
      },
    });

    let alertsSent = 0;

    for (const setting of settings) {
      const daysThreshold = setting.deadlineAlertDays || 7;
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

      // Find projects with upcoming deadlines
      const projects = await prisma.supportProject.findMany({
        where: {
          deadline: {
            gte: new Date(),
            lte: thresholdDate,
          },
          status: "active",
        },
        select: {
          id: true,
          name: true,
          deadline: true,
        },
      });

      // Send alerts for each project
      for (const project of projects) {
        try {
          await sendDeadlineAlert(setting.userId, project.id);
          alertsSent++;
        } catch (error) {
          logger.error(`Failed to send deadline alert for project ${project.id}`, { error });
        }
      }
    }

    logger.info(`Deadline alerts check completed: ${alertsSent} alerts sent`);

    return NextResponse.json({
      success: true,
      message: `Deadline alerts check completed`,
      alertsSent,
    });
  } catch (error) {
    logger.error("Deadline alerts error", { error });
    return NextResponse.json(
      { error: "Failed to process deadline alerts" },
      { status: 500 }
    );
  }
}
