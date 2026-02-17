# OpenFang

Self-hosted personal AI assistant. Discord integration, web UI, persistent memory, scheduled tasks, shell access.

A simplified, single-user alternative to OpenClaw -- one process, one SQLite file, zero external dependencies.

## Features

- **Discord DM bot** -- chat with Claude via Discord direct messages
- **Web chat UI** -- built-in chat interface with debug panel (tool calls, token usage, memory extractions)
- **Web search** -- Brave Search API with deep page reading via Mozilla Readability
- **Shell execution** -- run commands on your machine from Discord or web chat
- **Persistent memory** -- auto-extracts facts from conversations, searchable via FTS5
- **Scheduled tasks** -- cron-style recurring tasks and one-shot reminders, managed via natural language
- **Configurable** -- system prompt, model, tool toggles, all editable from the web UI

## Prerequisites

- Node.js >= 22
- pnpm (`npm i -g pnpm`)
- A Discord bot token ([Developer Portal](https://discord.com/developers/applications))
- One of:
  - An Anthropic API key ([console.anthropic.com](https://console.anthropic.com/))
  - An Anthropic-compatible gateway endpoint (for example, an OpenClaw-style relay)
- (Optional) Brave Search API key ([brave.com/search/api](https://brave.com/search/api/))

## Quick Start

```bash
# Clone and enter
git clone <your-repo-url> openfang
cd openfang

# Install dependencies
pnpm install

# Configure
cp .env.example .env
# Edit .env with your tokens

# Run (dev mode with hot reload)
pnpm dev
```

The server starts and prints:

```
[OpenFang] Database ready (./data/openfang.db)
[OpenFang] Web UI + API running at http://localhost:3000
[OpenFang] Discord bot connected as YourBot#1234
[OpenFang] Scheduler started
```

Open http://localhost:3000 to access the web UI.

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** tab, click "Reset Token", copy it to `.env` as `DISCORD_TOKEN`
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Go to **OAuth2 > URL Generator**, select `bot` scope with permissions:
   - Send Messages
   - Read Message History
   - Attach Files
6. Open the generated URL to invite the bot to your server
7. DM the bot to start chatting

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `ANTHROPIC_API_KEY` | Conditional | Required for official Anthropic endpoint, optional for custom gateways |
| `ANTHROPIC_BASE_URL` | No | Anthropic-compatible API base URL (default: `https://api.anthropic.com`) |
| `BRAVE_SEARCH_API_KEY` | No | Brave Search API key (for web search) |
| `WEB_PORT` | No | Web UI port (default: 3000) |
| `WEB_AUTH_PASSWORD` | No | Password for web UI API (Bearer token) |
| `DATABASE_URL` | No | SQLite path (default: ./data/openfang.db) |

## Subscription plans vs API access (review)

If your goal is to use a flat-rate "$20/month" consumer subscription (Claude Pro, ChatGPT Plus, Copilot) instead of pay-per-request API billing:

- Those subscriptions are generally for first-party apps/websites, not direct API usage.
- This project does not implement browser/session automation against consumer UIs.
- OpenFang supports official Anthropic API access, plus custom Anthropic-compatible gateways via `ANTHROPIC_BASE_URL`.

For OpenClaw-like setups, run a compatible relay/gateway and point `ANTHROPIC_BASE_URL` to it. Ensure your setup complies with the provider's terms and account policies.

## Web UI Development

To work on the web UI with hot reload:

```bash
# Terminal 1: server
pnpm dev

# Terminal 2: web UI (Vite dev server with API proxy)
pnpm dev:web
```

The Vite dev server runs on http://localhost:5173 and proxies `/api/*` to the server.

## Production Build

```bash
pnpm build   # Builds web UI + server
pnpm start   # Runs compiled server (serves web UI as static files)
```

## Architecture

```
Single Node.js process
├── Fastify API (REST + SSE)
├── Discord.js bot (DM handler)
├── Anthropic-compatible LLM endpoint (tool-use loop)
├── Scheduler (cron + reminders)
├── Memory (auto-extraction + FTS5)
└── SQLite (Drizzle ORM)
```

## Tools

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via Brave Search API |
| `web_read` | Fetch and extract readable content from a URL |
| `calculator` | Evaluate math expressions |
| `shell_exec` | Execute shell commands on the host |
| `recall_memory` | Search persistent memory |
| `save_memory` | Manually save a fact |
| `list_memories` | List stored memories |
| `forget_memory` | Delete a memory |
| `create_schedule` | Create a recurring cron task |
| `set_reminder` | Set a one-shot reminder |
| `list_schedules` | List active schedules |
| `delete_schedule` | Cancel a schedule |

All tools can be toggled on/off in the web UI settings.

## License

MIT
