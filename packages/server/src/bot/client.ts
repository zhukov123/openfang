import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
} from "discord.js";
import { env } from "../env.js";
import { handleDM } from "./dm-handler.js";

let _client: Client | null = null;

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[OpenFang] Discord bot connected as ${c.user.tag}`);
    c.user.setActivity("DM me!", { type: ActivityType.Listening });
  });

  client.on(Events.MessageCreate, async (message) => {
    // Ignore bots and non-DMs
    if (message.author.bot) return;
    if (!message.channel.isDMBased()) return;

    await handleDM(message);
  });

  client.on(Events.Error, (err) => {
    console.error("[OpenFang] Discord client error:", err);
  });

  _client = client;
  return client;
}

export function getDiscordClient(): Client | null {
  return _client;
}

export async function loginDiscordClient(client: Client): Promise<void> {
  await client.login(env.DISCORD_TOKEN);
}
