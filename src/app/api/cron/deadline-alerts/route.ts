/**
 * Deadline Alerts Cron Job (PRD Phase 7)
 * GET /api/cron/deadline-alerts - Check and send deadline alerts
 *
 * This endpoint should be called by a cron service (e.g., Vercel Cron, Upstash QStash)
 * to check for upcoming deadlines and send notifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDeadlineAlert } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  try {
    // Verify cron authorization (optional but recommended)
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Deadline alerts check started");

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
          console.error(
            `[Cron] Failed to send deadline alert for project ${project.id}:`,
            error
          );
        }
      }
    }

    console.log(`[Cron] Deadline alerts check completed: ${alertsSent} alerts sent`);

    return NextResponse.json({
      success: true,
      message: `Deadline alerts check completed`,
      alertsSent,
    });
  } catch (error) {
    console.error("[Cron] Deadline alerts error:", error);
    return NextResponse.json(
      { error: "Failed to process deadline alerts" },
      { status: 500 }
    );
  }
}
