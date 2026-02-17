import { getAnthropicClient } from "../ai/anthropic.js";
import { getDb } from "../db/index.js";
import { config } from "../db/schema.js";
import { eq } from "drizzle-orm";

const EXTRACTION_PROMPT = `You are a memory extraction system. Given a conversation exchange, extract any NEW facts worth remembering long-term about the user or their projects/preferences.

Categories:
- preference: user likes, dislikes, preferred tools/languages/workflows
- fact: concrete facts (IPs, paths, names, dates, credentials-free info)
- project: project names, tech stacks, repos, goals
- person: people the user mentions (colleagues, friends, contacts)
- general: anything else noteworthy

Rules:
- Only extract genuinely useful facts, not trivial conversation
- Be concise -- each fact should be a single clear sentence
- Do NOT extract sensitive data like passwords or API keys
- If nothing noteworthy, return an empty array

Return ONLY a JSON array:
[{ "content": "...", "category": "preference|fact|project|person|general" }]

If nothing to extract, return: []`;

interface ExtractedFact {
  content: string;
  category: string;
}

export async function extractMemories(
  conversationMessages: Array<{ role: string; content: string }>,
  conversationId: string
): Promise<ExtractedFact[]> {
  const db = getDb();

  // Check if auto-extraction is enabled
  const autoExtractRow = db
    .select()
    .from(config)
    .where(eq(config.key, "memory_auto_extract"))
    .get();
  if (autoExtractRow && JSON.parse(autoExtractRow.value) === false) {
    return [];
  }

  const modelRow = db
    .select()
    .from(config)
    .where(eq(config.key, "model"))
    .get();
  const model = modelRow ? JSON.parse(modelRow.value) : "claude-sonnet-4-20250514";

  // Build a concise version of recent messages for extraction
  const recentMessages = conversationMessages.slice(-6);
  const exchangeText = recentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extract memories from this exchange:\n\n${exchangeText}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const facts: ExtractedFact[] = JSON.parse(jsonMatch[0]);

    // Validate structure
    return facts.filter(
      (f) =>
        typeof f.content === "string" &&
        typeof f.category === "string" &&
        f.content.length > 0
    );
  } catch (err) {
    console.error("[OpenFang] Memory extraction failed:", err);
    return [];
  }
}
