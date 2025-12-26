/**
 * Notification Service (PRD Phase 7)
 * Discord, Slack, Resend email integration
 */

import { Resend } from "resend";
import { prisma } from "./prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "notifications" });

// Initialize Resend
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export type NotificationType =
  | "deadline_alert"
  | "matching_result"
  | "evaluation_complete";

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  url?: string;
}

/**
 * Send notification via enabled channels
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<void> {
  try {
    // Get user notification settings
    const settings = await prisma.notificationSetting.findUnique({
      where: { userId: payload.userId },
    });

    // Store notification in database
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data || {},
      },
    });

    // Send via enabled channels
    const promises: Promise<any>[] = [];

    if (settings?.emailEnabled) {
      promises.push(sendEmailNotification(payload));
    }

    if (settings?.discordEnabled && settings.discordWebhookUrl) {
      promises.push(
        sendDiscordNotification(payload, settings.discordWebhookUrl)
      );
    }

    if (settings?.slackEnabled && settings.slackWebhookUrl) {
      promises.push(sendSlackNotification(payload, settings.slackWebhookUrl));
    }

    await Promise.allSettled(promises);
  } catch (error) {
    logger.error("Send notification error", { error });
  }
}

/**
 * Send email via Resend
 */
async function sendEmailNotification(
  payload: NotificationPayload
): Promise<void> {
  if (!resend) {
    logger.warn("Resend not configured");
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      logger.warn("User email not found");
      return;
    }

    await resend.emails.send({
      from: "Konarae FlowCoder <noreply@konarae.com>",
      to: user.email,
      subject: payload.title,
      html: buildEmailHtml(payload, user.name || "사용자"),
    });

    logger.info(`Email sent to ${user.email}`);
  } catch (error) {
    logger.error("Send email error", { error });
  }
}

/**
 * Send Discord webhook
 */
async function sendDiscordNotification(
  payload: NotificationPayload,
  webhookUrl: string
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: payload.title,
            description: payload.message,
            color: getNotificationColor(payload.type),
            url: payload.url,
            timestamp: new Date().toISOString(),
            footer: {
              text: "Konarae FlowCoder",
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    logger.info("Discord webhook sent");
  } catch (error) {
    logger.error("Send Discord error", { error });
  }
}

/**
 * Send Slack webhook
 */
async function sendSlackNotification(
  payload: NotificationPayload,
  webhookUrl: string
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: payload.title,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: payload.message,
            },
          },
          ...(payload.url
            ? [
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: {
                        type: "plain_text",
                        text: "자세히 보기",
                      },
                      url: payload.url,
                    },
                  ],
                },
              ]
            : []),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }

    logger.info("Slack webhook sent");
  } catch (error) {
    logger.error("Send Slack error", { error });
  }
}

/**
 * Build email HTML
 */
function buildEmailHtml(payload: NotificationPayload, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${payload.title}</h1>
    </div>
    <div class="content">
      <p>안녕하세요, ${userName}님!</p>
      <p>${payload.message}</p>
      ${payload.url ? `<a href="${payload.url}" class="button">자세히 보기</a>` : ""}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Konarae FlowCoder. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get Discord embed color by notification type
 */
function getNotificationColor(type: NotificationType): number {
  switch (type) {
    case "deadline_alert":
      return 0xf59e0b; // Orange
    case "matching_result":
      return 0x10b981; // Green
    case "evaluation_complete":
      return 0x3b82f6; // Blue
    default:
      return 0x6b7280; // Gray
  }
}

/**
 * Send deadline alert for support project
 */
export async function sendDeadlineAlert(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await prisma.supportProject.findUnique({
    where: { id: projectId },
  });

  if (!project || !project.deadline) return;

  const daysUntil = Math.ceil(
    (project.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  await sendNotification({
    userId,
    type: "deadline_alert",
    title: `마감 ${daysUntil}일 전: ${project.name}`,
    message: `"${project.name}" 지원사업의 마감일이 ${daysUntil}일 남았습니다. 서둘러 신청을 준비하세요!`,
    data: { projectId, daysUntil },
    url: `${process.env.NEXTAUTH_URL}/projects/${projectId}`,
  });
}

/**
 * Send matching result notification
 */
export async function sendMatchingResultNotification(
  userId: string,
  matchCount: number
): Promise<void> {
  await sendNotification({
    userId,
    type: "matching_result",
    title: `새로운 매칭 결과 ${matchCount}건`,
    message: `기업 프로필에 맞는 지원사업 ${matchCount}건이 발견되었습니다. 지금 확인해보세요!`,
    data: { matchCount },
    url: `${process.env.NEXTAUTH_URL}/matching/results`,
  });
}

/**
 * Send evaluation complete notification
 */
export async function sendEvaluationCompleteNotification(
  userId: string,
  evaluationId: string,
  totalScore: number
): Promise<void> {
  await sendNotification({
    userId,
    type: "evaluation_complete",
    title: "사업계획서 평가 완료",
    message: `사업계획서 평가가 완료되었습니다. 종합 점수: ${totalScore}점. 상세 피드백을 확인하세요.`,
    data: { evaluationId, totalScore },
    url: `${process.env.NEXTAUTH_URL}/evaluations/${evaluationId}`,
  });
}
