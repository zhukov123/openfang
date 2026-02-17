import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
import { getDb } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export const shellTool: Anthropic.Tool = {
  name: "shell_exec",
  description:
    "Execute a shell command on the host machine. Returns stdout, stderr, and exit code. Use for scripting, file operations, git, system info, etc.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      working_directory: {
        type: "string",
        description: "Optional working directory (defaults to configured default)",
      },
      timeout_ms: {
        type: "number",
        description:
          "Optional timeout in ms (default: 30000, max: 300000)",
      },
    },
    required: ["command"],
  },
};

function getShellConfig(): { cwd: string; timeout: number } {
  const db = getDb();

  const cwdRow = db
    .select()
    .from(config)
    .where(eq(config.key, "shell_working_directory"))
    .get();
  const timeoutRow = db
    .select()
    .from(config)
    .where(eq(config.key, "shell_timeout_ms"))
    .get();

  return {
    cwd: cwdRow ? JSON.parse(cwdRow.value) : process.env.HOME ?? "/tmp",
    timeout: timeoutRow ? JSON.parse(timeoutRow.value) : 30000,
  };
}

export async function shellExecute(
  input: Record<string, unknown>
): Promise<string> {
  const command = input.command as string;
  const shellConfig = getShellConfig();
  const cwd = (input.working_directory as string) || shellConfig.cwd;
  const timeoutMs = Math.min(
    (input.timeout_ms as number) || shellConfig.timeout,
    300000
  );

  const start = Date.now();

  return new Promise((resolve) => {
    execFile(
      "/bin/sh",
      ["-c", command],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const timedOut = error?.killed ?? false;
        const exitCode =
          error && "code" in error ? (error as { code: number }).code : error ? 1 : 0;

        resolve(
          JSON.stringify({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode,
            durationMs,
            timedOut,
            command,
            cwd,
          })
        );
      }
    );
  });
}
