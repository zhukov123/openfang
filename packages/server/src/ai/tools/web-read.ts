import Anthropic from "@anthropic-ai/sdk";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";

export const webReadTool: Anthropic.Tool = {
  name: "web_read",
  description:
    "Fetch a URL and extract its readable content. Use after web_search to read full articles, docs, or pages. Returns cleaned text content (HTML stripped, ads removed).",
  input_schema: {
    type: "object" as const,
    properties: {
      url: { type: "string", description: "The URL to fetch and read" },
      max_length: {
        type: "number",
        description:
          "Max characters to return (default: 8000, max: 30000)",
      },
    },
    required: ["url"],
  },
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function webReadExecute(
  input: Record<string, unknown>
): Promise<string> {
  const url = input.url as string;
  const maxLength = Math.min((input.max_length as number) || 8000, 30000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return JSON.stringify({
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();

    // Try Readability first (works great for articles)
    let content = extractWithReadability(html, url);

    // Fall back to Cheerio if Readability fails
    if (!content || content.length < 100) {
      content = extractWithCheerio(html);
    }

    if (!content || content.trim().length === 0) {
      return JSON.stringify({
        error: "Could not extract readable content from this page",
        url,
        contentType,
      });
    }

    // Truncate if needed
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + "\n\n[Content truncated]";
    }

    return JSON.stringify({
      url,
      title: extractTitle(html),
      content,
      length: content.length,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return JSON.stringify({ error: "Request timed out (10s)", url });
    }
    return JSON.stringify({
      error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
      url,
    });
  }
}

function extractWithReadability(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent ?? null;
  } catch {
    return null;
  }
}

function extractWithCheerio(html: string): string | null {
  try {
    const $ = cheerio.load(html);

    // Remove non-content elements
    $(
      "script, style, nav, header, footer, aside, .sidebar, .nav, .menu, .ad, .advertisement, iframe, noscript"
    ).remove();

    // Try common content selectors
    const selectors = [
      "article",
      "main",
      '[role="main"]',
      ".post-content",
      ".article-content",
      ".entry-content",
      "#content",
      ".content",
    ];

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        const text = el.text().replace(/\s+/g, " ").trim();
        if (text.length > 100) return text;
      }
    }

    // Last resort: body text
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    return bodyText.length > 50 ? bodyText : null;
  } catch {
    return null;
  }
}

function extractTitle(html: string): string {
  try {
    const $ = cheerio.load(html);
    return $("title").first().text().trim() || "Untitled";
  } catch {
    return "Untitled";
  }
}
