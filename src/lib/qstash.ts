/**
 * Upstash QStash Client
 * Serverless message queue and scheduling
 */

import { Client, Receiver } from "@upstash/qstash";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "qstash" });

// Check if QStash is configured
export const isQStashConfigured = Boolean(process.env.QSTASH_TOKEN);

// QStash client for publishing messages and managing schedules
// Only create client if token is available
export const qstashClient = isQStashConfigured
  ? new Client({
      token: process.env.QSTASH_TOKEN!,
    })
  : null;

// QStash receiver for verifying incoming webhook signatures
// Only create receiver if signing keys are available
const hasSigningKeys = Boolean(
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
);

export const qstashReceiver = hasSigningKeys
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    })
  : null;

/**
 * Verify QStash signature from incoming request
 */
export async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  if (!signature) return false;
  if (!qstashReceiver) {
    logger.warn("Receiver not configured, skipping signature verification");
    return false;
  }

  try {
    await qstashReceiver.verify({
      signature,
      body,
    });
    return true;
  } catch (error) {
    logger.error("Signature verification failed", { error });
    return false;
  }
}

/**
 * Create or update a QStash schedule
 * @param scheduleId - Unique identifier for the schedule (for updates)
 * @param destination - URL to call
 * @param cron - Cron expression (UTC timezone)
 */
export async function createSchedule(
  destination: string,
  cron: string,
  scheduleId?: string
) {
  if (!qstashClient) {
    logger.warn("Client not configured, cannot create schedule");
    return { success: false, error: "QStash not configured" };
  }

  try {
    const result = await qstashClient.schedules.create({
      destination,
      cron,
      ...(scheduleId && { scheduleId }),
    });

    logger.info(`Schedule created: ${result.scheduleId}`);
    return { success: true, scheduleId: result.scheduleId };
  } catch (error) {
    logger.error("Failed to create schedule", { error });
    return { success: false, error };
  }
}

/**
 * Delete a QStash schedule
 */
export async function deleteSchedule(scheduleId: string) {
  if (!qstashClient) {
    logger.warn("Client not configured, cannot delete schedule");
    return { success: false, error: "QStash not configured" };
  }

  try {
    await qstashClient.schedules.delete(scheduleId);
    logger.info(`Schedule deleted: ${scheduleId}`);
    return { success: true };
  } catch (error) {
    logger.error("Failed to delete schedule", { error });
    return { success: false, error };
  }
}

/**
 * List all QStash schedules
 */
export async function listSchedules() {
  if (!qstashClient) {
    // Not an error - just not configured
    return { success: true, schedules: [], notConfigured: true };
  }

  try {
    const schedules = await qstashClient.schedules.list();
    return { success: true, schedules };
  } catch (error) {
    logger.error("Failed to list schedules", { error });
    return { success: false, error };
  }
}

/**
 * Get a specific schedule
 */
export async function getSchedule(scheduleId: string) {
  if (!qstashClient) {
    logger.warn("Client not configured, cannot get schedule");
    return { success: false, error: "QStash not configured" };
  }

  try {
    const schedule = await qstashClient.schedules.get(scheduleId);
    return { success: true, schedule };
  } catch (error) {
    logger.error("Failed to get schedule", { error });
    return { success: false, error };
  }
}

// ============================================
// Document Analysis Queue
// ============================================

export interface DocumentAnalysisJobPayload {
  documentId: string;
  filePath: string;
  documentType: string;
  mimeType: string;
}

/**
 * Queue document analysis job via QStash
 * This decouples the upload from analysis, preventing connection pool exhaustion
 */
export async function queueDocumentAnalysis(
  payload: DocumentAnalysisJobPayload
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!qstashClient) {
    logger.warn("Client not configured, cannot queue document analysis");
    return { success: false, error: "QStash not configured" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    logger.error("No base URL configured");
    return { success: false, error: "Base URL not configured" };
  }

  try {
    const result = await qstashClient.publishJSON({
      url: `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/documents/analyze-job`,
      body: payload,
      retries: 3,
      delay: "3s", // 3초 후 실행 (업로드 완료 보장)
    });

    logger.info(`Document analysis queued: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error("Failed to queue document analysis", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Queue failed",
    };
  }
}
