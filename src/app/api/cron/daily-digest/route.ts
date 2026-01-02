/**
 * Daily Digest Cron Job
 * GET/POST /api/cron/daily-digest - Send daily matching result summary emails
 *
 * Schedule: Daily at 09:00 KST (00:00 UTC)
 * Runs 3 hours after matching-refresh (06:00 KST) to ensure results are ready
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyDigestEmail } from "@/lib/notifications";
import { verifyQStashSignature } from "@/lib/qstash";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "cron-daily-digest" });

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Verify request authorization (multi-source support)
 */
async function verifyAuthorization(
  req: NextRequest
): Promise<{ valid: boolean; source: string }> {
  // 1. Check Vercel Cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { valid: true, source: "vercel-cron" };
  }

  // 2. Check QStash signature
  const qstashSignature = req.headers.get("upstash-signature");
  if (qstashSignature) {
    const body = await req.clone().text();
    const isValid = await verifyQStashSignature(qstashSignature, body);
    if (isValid) {
      return { valid: true, source: "qstash" };
    }
  }

  // 3. Check manual admin trigger
  const apiKey = req.headers.get("x-api-key");
  if (apiKey === process.env.ADMIN_API_KEY) {
    return { valid: true, source: "admin" };
  }

  return { valid: false, source: "unknown" };
}

/**
 * Execute daily digest email sending
 */
async function executeDailyDigest(source: string): Promise<NextResponse> {
  try {
    logger.info(`Daily digest started via ${source}`);

    // Get users with email enabled and matching results from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find users with notification settings enabled for matching results
    const usersWithSettings = await prisma.notificationSetting.findMany({
      where: {
        emailEnabled: true,
        matchingResultEnabled: true,
      },
      select: {
        userId: true,
        discordEnabled: true,
        discordWebhookUrl: true,
        slackEnabled: true,
        slackWebhookUrl: true,
      },
    });

    if (usersWithSettings.length === 0) {
      logger.info("No users with email notifications enabled");
      return NextResponse.json({
        success: true,
        message: "No users to notify",
        emailsSent: 0,
        triggeredBy: source,
      });
    }

    const userIds = usersWithSettings.map((s) => s.userId);

    // Get matching results grouped by user (created today or updated today)
    const matchingResults = await prisma.matchingResult.findMany({
      where: {
        userId: { in: userIds },
        createdAt: { gte: today },
      },
      select: {
        userId: true,
        totalScore: true,
        confidence: true,
        matchReasons: true,
        project: {
          select: {
            id: true,
            name: true,
            organization: true,
            category: true,
            deadline: true,
            amountMin: true,
            amountMax: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { totalScore: "desc" },
    });

    // Group results by user
    const resultsByUser = new Map<
      string,
      typeof matchingResults
    >();
    for (const result of matchingResults) {
      const existing = resultsByUser.get(result.userId) || [];
      existing.push(result);
      resultsByUser.set(result.userId, existing);
    }

    // Send digest emails
    let emailsSent = 0;
    let discordSent = 0;
    let slackSent = 0;
    const errors: string[] = [];

    for (const [userId, results] of resultsByUser) {
      if (results.length === 0) continue;

      try {
        // Get user info
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        if (!user?.email) continue;

        // Get user's notification settings
        const settings = usersWithSettings.find((s) => s.userId === userId);

        // Send email digest
        await sendDailyDigestEmail({
          userId,
          email: user.email,
          userName: user.name || "사용자",
          matchingResults: results.slice(0, 10), // Top 10 results
          totalCount: results.length,
        });
        emailsSent++;

        // Send Discord notification if enabled
        if (settings?.discordEnabled && settings.discordWebhookUrl) {
          await sendDiscordDigest(settings.discordWebhookUrl, results.slice(0, 5), results.length);
          discordSent++;
        }

        // Send Slack notification if enabled
        if (settings?.slackEnabled && settings.slackWebhookUrl) {
          await sendSlackDigest(settings.slackWebhookUrl, results.slice(0, 5), results.length);
          slackSent++;
        }

        logger.info(`Daily digest sent to ${user.email}`, {
          matchCount: results.length,
          topScore: results[0]?.totalScore,
        });
      } catch (error) {
        const errorMsg = `User ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`;
        logger.error("Daily digest error", { errorMsg });
        errors.push(errorMsg);
      }
    }

    logger.info(
      `Daily digest completed: ${emailsSent} emails, ${discordSent} Discord, ${slackSent} Slack sent`
    );

    return NextResponse.json({
      success: true,
      message: "Daily digest completed",
      usersProcessed: resultsByUser.size,
      emailsSent,
      discordSent,
      slackSent,
      triggeredBy: source,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Daily digest error", { error });
    return NextResponse.json(
      {
        error: "Failed to send daily digest",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Send Discord digest notification
 */
async function sendDiscordDigest(
  webhookUrl: string,
  results: Array<{
    totalScore: number;
    project: { name: string; organization: string; deadline: Date | null };
  }>,
  totalCount: number
): Promise<void> {
  try {
    const fields = results.map((r, i) => ({
      name: `${i + 1}. ${r.project.name}`,
      value: `${r.project.organization} | 점수: ${r.totalScore}점${
        r.project.deadline
          ? ` | 마감: ${r.project.deadline.toLocaleDateString("ko-KR")}`
          : ""
      }`,
      inline: false,
    }));

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `📊 오늘의 매칭 결과 요약 (${totalCount}건)`,
            description: `기업 프로필에 맞는 지원사업 ${totalCount}건이 발견되었습니다.`,
            color: 0x10b981,
            fields,
            footer: { text: "FlowMate - 매일 아침 9시 발송" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (error) {
    logger.error("Discord digest error", { error });
  }
}

/**
 * Send Slack digest notification
 */
async function sendSlackDigest(
  webhookUrl: string,
  results: Array<{
    totalScore: number;
    project: { name: string; organization: string; deadline: Date | null };
  }>,
  totalCount: number
): Promise<void> {
  try {
    const resultBlocks = results.map((r, i) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${i + 1}. ${r.project.name}*\n${r.project.organization} | 점수: ${r.totalScore}점${
          r.project.deadline
            ? ` | 마감: ${r.project.deadline.toLocaleDateString("ko-KR")}`
            : ""
        }`,
      },
    }));

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `📊 오늘의 매칭 결과 요약 (${totalCount}건)`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `기업 프로필에 맞는 지원사업 *${totalCount}건*이 발견되었습니다.`,
            },
          },
          { type: "divider" },
          ...resultBlocks,
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "전체 결과 보기" },
                url: `${process.env.NEXTAUTH_URL}/matching/results`,
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    logger.error("Slack digest error", { error });
  }
}

// Vercel Cron sends GET requests
export async function GET(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    logger.error("Unauthorized GET request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeDailyDigest(source);
}

// QStash sends POST requests
export async function POST(req: NextRequest) {
  const { valid, source } = await verifyAuthorization(req);

  if (!valid) {
    logger.error("Unauthorized POST request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executeDailyDigest(source);
}
