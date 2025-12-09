/**
 * Upstash QStash Client
 * Serverless message queue and scheduling
 */

import { Client, Receiver } from "@upstash/qstash";

// QStash client for publishing messages and managing schedules
export const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// QStash receiver for verifying incoming webhook signatures
export const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

/**
 * Verify QStash signature from incoming request
 */
export async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  if (!signature) return false;

  try {
    await qstashReceiver.verify({
      signature,
      body,
    });
    return true;
  } catch (error) {
    console.error("[QStash] Signature verification failed:", error);
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
  try {
    const result = await qstashClient.schedules.create({
      destination,
      cron,
      ...(scheduleId && { scheduleId }),
    });

    console.log(`[QStash] Schedule created: ${result.scheduleId}`);
    return { success: true, scheduleId: result.scheduleId };
  } catch (error) {
    console.error("[QStash] Failed to create schedule:", error);
    return { success: false, error };
  }
}

/**
 * Delete a QStash schedule
 */
export async function deleteSchedule(scheduleId: string) {
  try {
    await qstashClient.schedules.delete(scheduleId);
    console.log(`[QStash] Schedule deleted: ${scheduleId}`);
    return { success: true };
  } catch (error) {
    console.error("[QStash] Failed to delete schedule:", error);
    return { success: false, error };
  }
}

/**
 * List all QStash schedules
 */
export async function listSchedules() {
  try {
    const schedules = await qstashClient.schedules.list();
    return { success: true, schedules };
  } catch (error) {
    console.error("[QStash] Failed to list schedules:", error);
    return { success: false, error };
  }
}

/**
 * Get a specific schedule
 */
export async function getSchedule(scheduleId: string) {
  try {
    const schedule = await qstashClient.schedules.get(scheduleId);
    return { success: true, schedule };
  } catch (error) {
    console.error("[QStash] Failed to get schedule:", error);
    return { success: false, error };
  }
}
