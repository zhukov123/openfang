import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../../db/index.js";
import { schedules } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { CronExpressionParser } from "cron-parser";

// ─── create_schedule ───

export const createScheduleTool: Anthropic.Tool = {
  name: "create_schedule",
  description:
    "Create a recurring scheduled task. The task will run on the cron schedule and DM the result. Use for daily briefings, periodic checks, etc.",
  input_schema: {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string",
        description:
          "What to do when the schedule fires (sent to the AI as a prompt)",
      },
      cron_expr: {
        type: "string",
        description:
          'Cron expression (5-field). E.g. "0 9 * * 1-5" for weekdays at 9am',
      },
      timezone: {
        type: "string",
        description:
          'Timezone (default: America/Los_Angeles). E.g. "America/New_York", "UTC"',
      },
      tools_enabled: {
        type: "boolean",
        description:
          "Whether the AI should have access to tools when running this task (default: true)",
      },
    },
    required: ["prompt", "cron_expr"],
  },
};

export async function createScheduleExecute(
  input: Record<string, unknown>
): Promise<string> {
  const prompt = input.prompt as string;
  const cronExpr = input.cron_expr as string;
  const timezone = (input.timezone as string) || "America/Los_Angeles";
  const toolsEnabled = input.tools_enabled !== false;

  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: timezone });
    const nextRunAt = interval.next().toDate().getTime();

    const db = getDb();
    const id = nanoid();

    db.insert(schedules)
      .values({
        id,
        discordUserId: null, // Set by the caller context
        type: "cron",
        prompt,
        cronExpr,
        runAt: null,
        timezone,
        enabled: true,
        lastRunAt: null,
        nextRunAt,
        toolsEnabled,
        createdAt: Date.now(),
      })
      .run();

    return JSON.stringify({
      success: true,
      id,
      prompt,
      cronExpr,
      timezone,
      nextRunAt: new Date(nextRunAt).toISOString(),
      toolsEnabled,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ─── set_reminder ───

export const setReminderTool: Anthropic.Tool = {
  name: "set_reminder",
  description:
    "Set a one-time reminder. The message will be DM'd to you at the specified time.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description: "The reminder message",
      },
      delay_minutes: {
        type: "number",
        description:
          "Minutes from now to send the reminder. Use this OR absolute_time.",
      },
      absolute_time: {
        type: "string",
        description:
          'ISO 8601 datetime for when to send. E.g. "2026-02-17T14:00:00-08:00". Use this OR delay_minutes.',
      },
    },
    required: ["message"],
  },
};

export async function setReminderExecute(
  input: Record<string, unknown>
): Promise<string> {
  const message = input.message as string;
  const delayMinutes = input.delay_minutes as number | undefined;
  const absoluteTime = input.absolute_time as string | undefined;

  let runAt: number;
  if (delayMinutes) {
    runAt = Date.now() + delayMinutes * 60 * 1000;
  } else if (absoluteTime) {
    runAt = new Date(absoluteTime).getTime();
    if (isNaN(runAt)) {
      return JSON.stringify({ success: false, error: "Invalid datetime format" });
    }
  } else {
    return JSON.stringify({
      success: false,
      error: "Provide either delay_minutes or absolute_time",
    });
  }

  if (runAt <= Date.now()) {
    return JSON.stringify({ success: false, error: "Reminder time must be in the future" });
  }

  const db = getDb();
  const id = nanoid();

  db.insert(schedules)
    .values({
      id,
      discordUserId: null,
      type: "reminder",
      prompt: message,
      cronExpr: null,
      runAt,
      timezone: "UTC",
      enabled: true,
      lastRunAt: null,
      nextRunAt: runAt,
      toolsEnabled: false,
      createdAt: Date.now(),
    })
    .run();

  return JSON.stringify({
    success: true,
    id,
    message,
    runAt: new Date(runAt).toISOString(),
  });
}

// ─── list_schedules ───

export const listSchedulesTool: Anthropic.Tool = {
  name: "list_schedules",
  description:
    "List all active scheduled tasks and reminders.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export async function listSchedulesExecute(
  _input: Record<string, unknown>
): Promise<string> {
  const db = getDb();
  const all = db
    .select()
    .from(schedules)
    .where(eq(schedules.enabled, true))
    .all();

  const formatted = all.map((s) => ({
    id: s.id,
    type: s.type,
    prompt: s.prompt,
    cronExpr: s.cronExpr,
    timezone: s.timezone,
    nextRunAt: new Date(s.nextRunAt).toISOString(),
    toolsEnabled: s.toolsEnabled,
  }));

  return JSON.stringify({ count: formatted.length, schedules: formatted });
}

// ─── delete_schedule ───

export const deleteScheduleTool: Anthropic.Tool = {
  name: "delete_schedule",
  description: "Cancel/delete a scheduled task or reminder by ID.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "The schedule ID to delete",
      },
    },
    required: ["id"],
  },
};

export async function deleteScheduleExecute(
  input: Record<string, unknown>
): Promise<string> {
  const id = input.id as string;
  const db = getDb();

  const existing = db.select().from(schedules).where(eq(schedules.id, id)).get();
  if (!existing) {
    return JSON.stringify({ success: false, error: "Schedule not found" });
  }

  db.delete(schedules).where(eq(schedules.id, id)).run();
  return JSON.stringify({
    success: true,
    deleted: { id, type: existing.type, prompt: existing.prompt },
  });
}
