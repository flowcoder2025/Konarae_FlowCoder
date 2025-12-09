/**
 * QStash Schedules Setup Script
 * Run once after deployment to set up cron schedules
 *
 * Usage: npx tsx scripts/setup-qstash-schedules.ts
 *
 * Required env vars:
 * - QSTASH_TOKEN
 * - NEXT_PUBLIC_APP_URL (your deployed URL)
 */

import { Client } from "@upstash/qstash";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";

if (!QSTASH_TOKEN) {
  console.error("❌ QSTASH_TOKEN is required");
  process.exit(1);
}

const qstash = new Client({ token: QSTASH_TOKEN });

// Schedule definitions (cron is in UTC)
const SCHEDULES = [
  {
    scheduleId: "crawl-all-daily",
    destination: `${APP_URL}/api/cron/crawl-all`,
    cron: "0 21 * * *", // KST 06:00 = UTC 21:00
    description: "전체 크롤링 (매일 새벽 6시 KST)",
  },
  {
    scheduleId: "deadline-alerts-daily",
    destination: `${APP_URL}/api/cron/deadline-alerts`,
    cron: "0 0 * * *", // KST 09:00 = UTC 00:00
    description: "마감 알림 (매일 오전 9시 KST)",
  },
];

async function setupSchedules() {
  console.log("🚀 Setting up QStash schedules...\n");
  console.log(`📍 App URL: ${APP_URL}\n`);

  // First, list existing schedules
  const existing = await qstash.schedules.list();
  console.log(`📋 Existing schedules: ${existing.length}\n`);

  for (const schedule of SCHEDULES) {
    console.log(`\n📅 ${schedule.description}`);
    console.log(`   ID: ${schedule.scheduleId}`);
    console.log(`   Cron: ${schedule.cron}`);
    console.log(`   URL: ${schedule.destination}`);

    try {
      // Check if schedule already exists
      const existingSchedule = existing.find(
        (s) => s.scheduleId === schedule.scheduleId
      );

      if (existingSchedule) {
        // Delete and recreate to update
        console.log(`   ⚠️  Deleting existing schedule...`);
        await qstash.schedules.delete(schedule.scheduleId);
      }

      // Create schedule
      const result = await qstash.schedules.create({
        scheduleId: schedule.scheduleId,
        destination: schedule.destination,
        cron: schedule.cron,
      });

      console.log(`   ✅ Created: ${result.scheduleId}`);
    } catch (error) {
      console.error(`   ❌ Failed:`, error);
    }
  }

  console.log("\n\n✨ Setup complete!");
  console.log("\n📌 Next steps:");
  console.log("1. Add these env vars to Vercel:");
  console.log("   - QSTASH_TOKEN");
  console.log("   - QSTASH_CURRENT_SIGNING_KEY");
  console.log("   - QSTASH_NEXT_SIGNING_KEY");
  console.log("\n2. Get signing keys from: https://console.upstash.com/qstash");
}

setupSchedules().catch(console.error);
