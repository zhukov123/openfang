import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

import { webSearchTool, webSearchExecute } from "./web-search.js";
import { webReadTool, webReadExecute } from "./web-read.js";
import { calculatorTool, calculatorExecute } from "./calculator.js";
import { shellTool, shellExecute } from "./shell.js";
import {
  recallMemoryTool,
  recallMemoryExecute,
  saveMemoryTool,
  saveMemoryExecute,
  listMemoriesTool,
  listMemoriesExecute,
  forgetMemoryTool,
  forgetMemoryExecute,
} from "./memory.js";
import {
  createScheduleTool,
  createScheduleExecute,
  setReminderTool,
  setReminderExecute,
  listSchedulesTool,
  listSchedulesExecute,
  deleteScheduleTool,
  deleteScheduleExecute,
} from "./schedule.js";

export interface ToolDefinition {
  name: string;
  tool: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

const allTools: ToolDefinition[] = [
  { name: "web_search", tool: webSearchTool, execute: webSearchExecute },
  { name: "web_read", tool: webReadTool, execute: webReadExecute },
  { name: "calculator", tool: calculatorTool, execute: calculatorExecute },
  { name: "shell_exec", tool: shellTool, execute: shellExecute },
  { name: "recall_memory", tool: recallMemoryTool, execute: recallMemoryExecute },
  { name: "save_memory", tool: saveMemoryTool, execute: saveMemoryExecute },
  { name: "list_memories", tool: listMemoriesTool, execute: listMemoriesExecute },
  { name: "forget_memory", tool: forgetMemoryTool, execute: forgetMemoryExecute },
  { name: "create_schedule", tool: createScheduleTool, execute: createScheduleExecute },
  { name: "set_reminder", tool: setReminderTool, execute: setReminderExecute },
  { name: "list_schedules", tool: listSchedulesTool, execute: listSchedulesExecute },
  { name: "delete_schedule", tool: deleteScheduleTool, execute: deleteScheduleExecute },
];

function getToolsEnabled(): Record<string, boolean> {
  const db = getDb();
  const row = db.select().from(config).where(eq(config.key, "tools_enabled")).get();
  if (!row) return {};
  return JSON.parse(row.value);
}

export function getEnabledToolDefinitions(): Anthropic.Tool[] {
  const enabled = getToolsEnabled();
  return allTools
    .filter((t) => enabled[t.name] !== false)
    .map((t) => t.tool);
}

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const enabled = getToolsEnabled();
  if (enabled[name] === false) {
    throw new Error(`Tool ${name} is disabled`);
  }

  return tool.execute(input);
}
