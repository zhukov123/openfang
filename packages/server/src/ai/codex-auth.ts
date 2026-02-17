import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface CodexAuthData {
  accessToken: string;
  accountId: string | null;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function expandHomePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    const home = process.env.HOME;
    if (!home) {
      throw new Error("HOME is not set; cannot resolve CODEX_AUTH_FILE path.");
    }
    return resolve(home, inputPath.slice(2));
  }
  return resolve(inputPath);
}

function findStringByPreferredKeys(
  value: JsonValue,
  keys: readonly string[],
  depth = 0
): string | null {
  if (depth > 12) return null;
  if (typeof value !== "object" || value === null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByPreferredKeys(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  for (const nested of Object.values(value)) {
    const found = findStringByPreferredKeys(nested, keys, depth + 1);
    if (found) return found;
  }

  return null;
}

export function loadCodexAuthData(authFilePath: string): CodexAuthData {
  const resolvedPath = expandHomePath(authFilePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Codex auth file not found at ${resolvedPath}. Run "codex login" first or update CODEX_AUTH_FILE.`
    );
  }

  let parsed: JsonValue;
  try {
    const raw = readFileSync(resolvedPath, "utf8");
    parsed = JSON.parse(raw) as JsonValue;
  } catch (err) {
    throw new Error(
      `Failed to parse Codex auth file at ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const accessToken = findStringByPreferredKeys(parsed, [
    "access_token",
    "accessToken",
    "token",
  ]);

  if (!accessToken) {
    throw new Error(
      `No access token found in ${resolvedPath}. Re-run "codex login" and ensure CODEX_AUTH_FILE points to the correct file.`
    );
  }

  const accountId = findStringByPreferredKeys(parsed, [
    "account_id",
    "accountId",
  ]);

  return { accessToken, accountId };
}
