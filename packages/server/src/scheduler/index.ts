import { getDb } from "../db/index.js";
import { schedules } from "../db/schema.js";
import { eq, and, lte } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { executeScheduledPrompt } from "./executor.js";
import type { Client } from "discord.js";

const TICK_INTERVAL_MS = 30_000; // 30 seconds
const MAX_RETRIES = 3;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let discordClient: Client | null = null;

export function startScheduler(client: Client) {
  discordClient = client;

  // Recompute all nextRunAt on startup (recovery)
  recomputeNextRuns();

  tickInterval = setInterval(() => tick(), TICK_INTERVAL_MS);
  console.log("[OpenFang] Scheduler started");
}

export function stopScheduler() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  console.log("[OpenFang] Scheduler stopped");
}

function recomputeNextRuns() {
  const db = getDb();
  const cronSchedules = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), eq(schedules.type, "cron")))
    .all();

  for (const schedule of cronSchedules) {
    if (!schedule.cronExpr) continue;

    try {
      const interval = CronExpressionParser.parse(schedule.cronExpr, {
        tz: schedule.timezone,
      });
      const nextRunAt = interval.next().toDate().getTime();

      db.update(schedules)
        .set({ nextRunAt })
        .where(eq(schedules.id, schedule.id))
        .run();
    } catch (err) {
      console.error(
        `[OpenFang] Failed to recompute schedule ${schedule.id}:`,
        err
      );
    }
  }
}

async function tick() {
  const db = getDb();
  const now = Date.now();

  const due = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
    .all();

  for (const schedule of due) {
    try {
      await executeSchedule(schedule);
    } catch (err) {
      console.error(
        `[OpenFang] Schedule ${schedule.id} execution failed:`,
        err
      );
    }
  }
}

async function executeSchedule(schedule: typeof schedules.$inferSelect) {
  const db = getDb();

  console.log(
    `[OpenFang] Executing schedule: ${schedule.id} (${schedule.type}) - "${schedule.prompt.slice(0, 50)}..."`
  );

  let resultText: string;

  if (schedule.type === "reminder") {
    // Plain reminder -- just send the text directly
    resultText = `⏰ **Reminder:** ${schedule.prompt}`;
  } else {
    // Cron task -- run through Claude
    resultText = await executeScheduledPrompt(
      schedule.prompt,
      schedule.toolsEnabled ?? true
    );
  }

  // Send DM via Discord
  if (discordClient && schedule.discordUserId) {
    try {
      const user = await discordClient.users.fetch(schedule.discordUserId);
      const dm = await user.createDM();

      // Chunk if >2000 chars
      const chunks = chunkMessage(resultText, 1900);
      for (const chunk of chunks) {
        await dm.send(chunk);
      }
    } catch (err) {
      console.error(
        `[OpenFang] Failed to DM user ${schedule.discordUserId}:`,
        err
      );
    }
  }

  // Update schedule
  if (schedule.type === "reminder") {
    // One-shot: delete after execution
    db.delete(schedules).where(eq(schedules.id, schedule.id)).run();
  } else if (schedule.cronExpr) {
    // Recurring: compute next run time
    try {
      const interval = CronExpressionParser.parse(schedule.cronExpr, {
        tz: schedule.timezone,
      });
      const nextRunAt = interval.next().toDate().getTime();

      db.update(schedules)
        .set({ lastRunAt: Date.now(), nextRunAt })
        .where(eq(schedules.id, schedule.id))
        .run();
    } catch (err) {
      console.error(
        `[OpenFang] Failed to compute next run for ${schedule.id}:`,
        err
      );
      // Disable the schedule if cron is broken
      db.update(schedules)
        .set({ enabled: false })
        .where(eq(schedules.id, schedule.id))
        .run();
    }
  }
}

function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline
    let breakIdx = remaining.lastIndexOf("\n", maxLen);
    if (breakIdx < maxLen / 2) {
      // Try space
      breakIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (breakIdx < maxLen / 2) {
      breakIdx = maxLen;
    }

    chunks.push(remaining.slice(0, breakIdx));
    remaining = remaining.slice(breakIdx).trimStart();
  }

  return chunks;
}
