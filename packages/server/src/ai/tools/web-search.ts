import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";

export const webSearchTool: Anthropic.Tool = {
  name: "web_search",
  description:
    "Search the web using Brave Search. Returns titles, URLs, and snippets for the top results. Use this for discovery, then use web_read to dive deeper into specific pages.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
      count: {
        type: "number",
        description: "Number of results (default: 5, max: 20)",
      },
      freshness: {
        type: "string",
        enum: ["day", "week", "month", "year"],
        description: "Optional: filter by recency",
      },
      country: {
        type: "string",
        description:
          "Optional: country code for localized results (e.g. 'US')",
      },
    },
    required: ["query"],
  },
};

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export async function webSearchExecute(
  input: Record<string, unknown>
): Promise<string> {
  try {
    const apiKey = env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      return JSON.stringify({
        error: "BRAVE_SEARCH_API_KEY not configured. Set it in .env or web UI settings.",
      });
    }

    const query = input.query as string;
    const count = Math.min((input.count as number) || 5, 20);
    const freshness = input.freshness as string | undefined;
    const country = input.country as string | undefined;

    const params = new URLSearchParams({
      q: query,
      count: String(count),
    });

    if (freshness) params.set("freshness", freshness);
    if (country) params.set("country", country);

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return JSON.stringify({
        error: `Brave Search API error: ${response.status} ${response.statusText}`,
        details: body.slice(0, 200),
      });
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> };
    };
    const results: BraveSearchResult[] = (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age,
    }));

    return JSON.stringify(results, null, 2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: "Web search failed",
      details: message,
    });
  }
}
