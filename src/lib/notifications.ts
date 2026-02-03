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

// ============================================
// Crawler Alert System (Phase 4)
// ============================================

// Debounce cache for crawler alerts (1 hour)
const crawlerAlertCache = new Map<string, number>();
const CRAWLER_ALERT_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Send crawler alert to admin Discord webhook
 * Debounced to prevent alert spam (1 hour per alert type)
 */
export async function sendCrawlerAlert(
  alertType: "parsing_failure" | "structure_change" | "consecutive_failures",
  details: {
    source?: string;
    message: string;
    consecutiveFailures?: number;
    failedFields?: string[];
    timestamp?: Date;
  }
): Promise<void> {
  const webhookUrl = process.env.CRAWLER_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("CRAWLER_DISCORD_WEBHOOK_URL not configured, skipping alert");
    return;
  }

  // Debounce check
  const cacheKey = `${alertType}:${details.source || "unknown"}`;
  const lastAlert = crawlerAlertCache.get(cacheKey);
  const now = Date.now();

  if (lastAlert && now - lastAlert < CRAWLER_ALERT_DEBOUNCE_MS) {
    logger.info(`Crawler alert debounced: ${cacheKey}`);
    return;
  }

  // Update cache
  crawlerAlertCache.set(cacheKey, now);

  // Build Discord embed
  const color = alertType === "consecutive_failures" ? 0xff0000 : // Red
                alertType === "structure_change" ? 0xffa500 : // Orange
                0xffff00; // Yellow

  const title = {
    parsing_failure: "⚠️ 크롤러 파싱 실패",
    structure_change: "🔧 웹사이트 구조 변경 감지",
    consecutive_failures: "🚨 크롤러 연속 실패",
  }[alertType];

  const fields = [
    { name: "출처", value: details.source || "알 수 없음", inline: true },
    { name: "시간", value: (details.timestamp || new Date()).toLocaleString("ko-KR"), inline: true },
  ];

  if (details.consecutiveFailures) {
    fields.push({
      name: "연속 실패 횟수",
      value: `${details.consecutiveFailures}회`,
      inline: true,
    });
  }

  if (details.failedFields && details.failedFields.length > 0) {
    fields.push({
      name: "실패한 필드",
      value: details.failedFields.join(", "),
      inline: false,
    });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description: details.message,
            color,
            fields,
            footer: { text: "FlowMate Crawler Monitor" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    logger.info(`Crawler alert sent: ${alertType}`, { source: details.source });
  } catch (error) {
    logger.error("Failed to send crawler alert", { error });
  }
}

/**
 * Track consecutive failures for a crawl source
 */
const consecutiveFailures = new Map<string, number>();

export function trackCrawlerFailure(sourceId: string): number {
  const current = consecutiveFailures.get(sourceId) || 0;
  const newCount = current + 1;
  consecutiveFailures.set(sourceId, newCount);
  return newCount;
}

export function resetCrawlerFailures(sourceId: string): void {
  consecutiveFailures.delete(sourceId);
}

export function getCrawlerFailureCount(sourceId: string): number {
  return consecutiveFailures.get(sourceId) || 0;
}

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
      from: "FlowMate <noreply@flow-coder.com>",
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
              text: "FlowMate",
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
      <p>© ${new Date().getFullYear()} FlowMate. All rights reserved.</p>
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

/**
 * Daily Digest Email Payload
 */
export interface DailyDigestPayload {
  userId: string;
  email: string;
  userName: string;
  matchingResults: Array<{
    totalScore: number;
    confidence: string;
    matchReasons: string[];
    project: {
      id: string;
      name: string;
      organization: string;
      category: string;
      deadline: Date | null;
      amountMin: bigint | null;
      amountMax: bigint | null;
    };
    company: {
      id: string;
      name: string;
    };
  }>;
  totalCount: number;
}

/**
 * Send daily digest email with matching results summary
 */
export async function sendDailyDigestEmail(
  payload: DailyDigestPayload
): Promise<void> {
  if (!resend) {
    logger.warn("Resend not configured, skipping daily digest email");
    return;
  }

  try {
    await resend.emails.send({
      from: "FlowMate <noreply@flow-coder.com>",
      to: payload.email,
      subject: `📊 오늘의 매칭 결과 요약 - ${payload.totalCount}건의 지원사업 발견`,
      html: buildDailyDigestHtml(payload),
    });

    logger.info(`Daily digest email sent to ${payload.email}`, {
      matchCount: payload.totalCount,
    });
  } catch (error) {
    logger.error("Send daily digest email error", { error, email: payload.email });
    throw error;
  }
}

/**
 * Format amount for display
 */
function formatAmount(min: bigint | null, max: bigint | null): string {
  if (!min && !max) return "금액 미정";

  const formatBigInt = (n: bigint) => {
    const num = Number(n);
    if (num >= 100000000) return `${(num / 100000000).toFixed(0)}억원`;
    if (num >= 10000) return `${(num / 10000).toFixed(0)}만원`;
    return `${num.toLocaleString()}원`;
  };

  if (min && max) {
    return `${formatBigInt(min)} ~ ${formatBigInt(max)}`;
  }
  if (max) return `최대 ${formatBigInt(max)}`;
  if (min) return `${formatBigInt(min)} 이상`;
  return "금액 미정";
}

/**
 * Build daily digest email HTML
 * Design tokens: Primary Teal (#0d9488), matching project CSS
 */
function buildDailyDigestHtml(payload: DailyDigestPayload): string {
  // Brand colors (from globals.css - Teal primary)
  const colors = {
    primary: "#0d9488",        // teal-600
    primaryLight: "#5eead4",   // teal-300
    primaryDark: "#0f766e",    // teal-700
    background: "#ffffff",
    foreground: "#111827",
    muted: "#6b7280",
    mutedBg: "#f3f4f6",
    border: "#e5e7eb",
    success: "#10b981",        // green-500
    warning: "#f59e0b",        // amber-500
    footerBg: "#111827",
  };

  // Text-based labels (email clients block SVG)
  const labels = {
    chart: "",
    target: "✦ ",
    calendar: "마감 ",
    coins: "",
    lightbulb: "TIP ",
  };

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const resultRows = payload.matchingResults
    .map((result, index) => {
      const deadline = result.project.deadline
        ? new Date(result.project.deadline).toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
          })
        : "상시";

      const confidenceColor =
        result.confidence === "high"
          ? colors.success
          : result.confidence === "medium"
          ? colors.warning
          : colors.muted;

      const confidenceText =
        result.confidence === "high"
          ? "높음"
          : result.confidence === "medium"
          ? "보통"
          : "낮음";

      // Email-safe layout using tables instead of flexbox (better email client compatibility)
      return `
        <tr style="border-bottom: 1px solid ${colors.border};">
          <td style="padding: 16px; vertical-align: top;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="44" valign="top" style="padding-right: 12px;">
                  <div style="background: ${colors.primary}; color: white; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: bold; font-size: 14px;">
                    ${index + 1}
                  </div>
                </td>
                <td valign="top">
                  <a href="${process.env.NEXTAUTH_URL}/projects/${result.project.id}" style="color: ${colors.foreground}; font-weight: 600; text-decoration: none; font-size: 16px;">
                    ${result.project.name}
                  </a>
                  <div style="color: ${colors.muted}; font-size: 14px; margin-top: 4px;">
                    ${result.project.organization} · ${result.project.category}
                  </div>
                  <div style="margin-top: 8px; font-size: 13px;">
                    <span style="color: ${confidenceColor}; font-weight: 600;">●</span>
                    <span style="color: #374151;"> 매칭 ${result.totalScore}점 (${confidenceText})</span>
                    <span style="color: ${colors.muted}; margin-left: 12px;">${labels.calendar}${deadline}</span>
                    <span style="color: ${colors.muted}; margin-left: 12px;">${labels.coins}${formatAmount(result.project.amountMin, result.project.amountMax)}</span>
                  </div>
                  ${
                    result.matchReasons.length > 0
                      ? `<div style="margin-top: 8px;">
                          ${result.matchReasons
                            .slice(0, 3)
                            .map(
                              (reason) =>
                                `<span style="background: #ccfbf1; color: ${colors.primaryDark}; padding: 2px 8px; border-radius: 12px; font-size: 12px; display: inline-block; margin-right: 6px; margin-bottom: 4px;">${reason}</span>`
                            )
                            .join("")}
                        </div>`
                      : ""
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>오늘의 매칭 결과 요약</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: ${colors.foreground}; margin: 0; padding: 0; background: #f9fafb;">
  <div style="max-width: 640px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primaryDark} 100%); color: white; padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">
        ${labels.chart}오늘의 매칭 결과
      </h1>
      <p style="margin: 0; opacity: 0.9; font-size: 14px;">
        ${today}
      </p>
    </div>

    <!-- Summary -->
    <div style="background: ${colors.background}; padding: 24px; border-left: 1px solid ${colors.border}; border-right: 1px solid ${colors.border};">
      <p style="margin: 0 0 16px 0; font-size: 16px;">
        안녕하세요, <strong>${payload.userName}</strong>님!
      </p>
      <p style="margin: 0; font-size: 16px;">
        <strong>${payload.matchingResults[0]?.company.name || "귀사"}</strong>에 맞는
        <span style="color: ${colors.primary}; font-weight: 700; font-size: 20px;">${payload.totalCount}건</span>의
        지원사업이 발견되었습니다.
      </p>
    </div>

    <!-- Results Table -->
    <div style="background: ${colors.background}; border-left: 1px solid ${colors.border}; border-right: 1px solid ${colors.border};">
      <div style="padding: 16px 24px; border-bottom: 2px solid ${colors.border};">
        <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #374151;">
          ${labels.target}추천 지원사업 TOP ${payload.matchingResults.length}
        </h2>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${resultRows}
        </tbody>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="background: ${colors.background}; padding: 24px; text-align: center; border-left: 1px solid ${colors.border}; border-right: 1px solid ${colors.border};">
      <a href="${process.env.NEXTAUTH_URL}/matching/results"
         style="display: inline-block; background: ${colors.primary}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        전체 매칭 결과 보기 →
      </a>
    </div>

    <!-- Tips -->
    <div style="background: #f0fdfa; padding: 20px 24px; border-left: 1px solid ${colors.border}; border-right: 1px solid ${colors.border};">
      <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: ${colors.primaryDark};">
        ${labels.lightbulb}더 나은 매칭을 위한 팁
      </h3>
      <ul style="margin: 0; padding-left: 20px; color: ${colors.muted}; font-size: 14px;">
        <li style="margin-bottom: 4px;">기업 정보를 최신 상태로 유지하세요</li>
        <li style="margin-bottom: 4px;">사업자등록증, 인증서 등 문서를 업로드하면 매칭 정확도가 높아집니다</li>
        <li>매칭 선호도 설정에서 관심 분야를 지정하세요</li>
      </ul>
    </div>

    <!-- Footer -->
    <div style="background: ${colors.footerBg}; color: #9ca3af; padding: 24px; border-radius: 0 0 16px 16px; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px;">
        이 이메일은 FlowMate 알림 설정에 따라 발송되었습니다.
      </p>
      <p style="margin: 0; font-size: 12px;">
        <a href="${process.env.NEXTAUTH_URL}/settings/notifications" style="color: ${colors.primaryLight};">알림 설정 변경</a>
        &nbsp;·&nbsp;
        <a href="${process.env.NEXTAUTH_URL}" style="color: ${colors.primaryLight};">FlowMate 바로가기</a>
      </p>
      <p style="margin: 16px 0 0 0; font-size: 12px; opacity: 0.7;">
        © ${new Date().getFullYear()} FlowMate. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
