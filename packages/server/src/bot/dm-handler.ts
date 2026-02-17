import { Message, AttachmentBuilder } from "discord.js";
import { findOrCreateConversation, runConversation } from "../ai/conversation.js";
import { processMemoryExtraction } from "../memory/index.js";

export async function handleDM(message: Message) {
  const userContent = message.content.trim();
  if (!userContent) return;

  // Show typing indicator
  const channel = message.channel;
  if ("sendTyping" in channel) {
    await channel.sendTyping();
  }
  const typingInterval = setInterval(() => {
    if ("sendTyping" in channel) {
      channel.sendTyping().catch(() => {});
    }
  }, 5000);

  try {
    const conversationId = await findOrCreateConversation({
      discordUserId: message.author.id,
      discordUsername: message.author.username,
      source: "discord",
    });

    let fullResponse = "";
    const toolCalls: Array<{ name: string; duration: number }> = [];

    for await (const event of runConversation(conversationId, userContent)) {
      switch (event.type) {
        case "text_delta":
          fullResponse += event.text;
          break;
        case "tool_use_start":
          toolCalls.push({ name: event.toolName, duration: 0 });
          break;
        case "tool_result":
          if (toolCalls.length > 0) {
            toolCalls[toolCalls.length - 1].duration = event.durationMs;
          }
          break;
        case "error":
          fullResponse = `Sorry, something went wrong: ${event.message}`;
          break;
      }
    }

    clearInterval(typingInterval);

    if (!fullResponse) {
      fullResponse = "I processed your request but have no text response.";
    }

    // Send response, chunking if needed
    await sendDiscordResponse(message, fullResponse);

    // Background memory extraction
    processMemoryExtraction(
      [
        { role: "user", content: userContent },
        { role: "assistant", content: fullResponse },
      ],
      conversationId
    ).catch((err) => {
      console.error("[OpenFang] Memory extraction error:", err);
    });
  } catch (err) {
    clearInterval(typingInterval);
    console.error("[OpenFang] DM handler error:", err);
    await message.reply(
      "Sorry, I encountered an error processing your message."
    );
  }
}

async function sendDiscordResponse(
  message: Message,
  content: string
): Promise<void> {
  const MAX_LEN = 1900;

  if (content.length <= MAX_LEN) {
    await message.reply(content);
    return;
  }

  // If very long, send summary + attachment
  if (content.length > MAX_LEN * 3) {
    const summary = content.slice(0, MAX_LEN - 100) + "\n\n*[Full response attached]*";
    const attachment = new AttachmentBuilder(Buffer.from(content, "utf-8"), {
      name: "response.txt",
    });
    await message.reply({ content: summary, files: [attachment] });
    return;
  }

  // Chunk into multiple messages
  const chunks = chunkText(content, MAX_LEN);
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      if ("send" in message.channel) {
        await message.channel.send(chunks[i]);
      }
    }
  }
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let breakIdx = remaining.lastIndexOf("\n", maxLen);
    if (breakIdx < maxLen / 2) {
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
