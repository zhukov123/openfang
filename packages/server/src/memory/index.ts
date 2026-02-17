import { getDb, getRawDb } from "../db/index.js";
import { memories } from "../db/schema.js";
import { nanoid } from "nanoid";
import { extractMemories } from "./extractor.js";

interface MemoryFact {
  content: string;
  category: string;
}

/**
 * Run post-conversation memory extraction and store new facts.
 * This should be called asynchronously after each conversation turn.
 */
export async function processMemoryExtraction(
  conversationMessages: Array<{ role: string; content: string }>,
  conversationId: string
): Promise<MemoryFact[]> {
  const facts = await extractMemories(conversationMessages, conversationId);
  if (facts.length === 0) return [];

  const stored: MemoryFact[] = [];

  for (const fact of facts) {
    const isDuplicate = await checkDuplicate(fact.content);
    if (isDuplicate) continue;

    const db = getDb();
    const now = Date.now();

    db.insert(memories)
      .values({
        id: nanoid(),
        content: fact.content,
        category: fact.category,
        source: "auto",
        conversationId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    stored.push(fact);
  }

  if (stored.length > 0) {
    console.log(
      `[OpenFang] Extracted ${stored.length} memories from conversation ${conversationId}`
    );
  }

  return stored;
}

/**
 * Check if a similar memory already exists using FTS5 search.
 */
async function checkDuplicate(content: string): Promise<boolean> {
  try {
    const rawDb = getRawDb();

    // Search for similar content
    const results = rawDb
      .prepare(
        `SELECT m.content FROM memories_fts
         JOIN memories m ON memories_fts.rowid = m.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank
         LIMIT 3`
      )
      .all(content) as Array<{ content: string }>;

    rawDb.close();

    // Simple similarity check: if any existing memory contains most of the same words
    for (const existing of results) {
      const similarity = computeSimilarity(
        content.toLowerCase(),
        existing.content.toLowerCase()
      );
      if (similarity > 0.7) return true;
    }

    return false;
  } catch {
    // FTS might fail on empty table or bad query
    return false;
  }
}

/**
 * Simple word-overlap similarity (Jaccard index).
 */
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}
