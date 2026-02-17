const BASE_URL = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Health
  getHealth: () => request<HealthResponse>("/health"),

  // Config
  getConfig: () => request<Record<string, unknown>>("/config"),
  updateConfig: (data: Record<string, unknown>) =>
    request<{ success: boolean }>("/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Conversations
  getConversations: (limit = 20, offset = 0) =>
    request<ConversationsResponse>(
      `/conversations?limit=${limit}&offset=${offset}`
    ),
  getMessages: (conversationId: string) =>
    request<MessagesResponse>(`/conversations/${conversationId}/messages`),
  deleteConversation: (id: string) =>
    request<{ success: boolean }>(`/conversations/${id}`, {
      method: "DELETE",
    }),

  // Memories
  getMemories: (params?: { q?: string; category?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    return request<MemoriesResponse>(`/memories?${searchParams}`);
  },
  deleteMemory: (id: string) =>
    request<{ success: boolean }>(`/memories/${id}`, { method: "DELETE" }),

  // Schedules
  getSchedules: () => request<SchedulesResponse>("/schedules"),
};

// ─── SSE Chat ───

export function streamChat(
  message: string,
  conversationId: string | null,
  onEvent: (event: ChatStreamEvent) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ event: currentEvent, data });
            } catch {
              // skip malformed
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onEvent({ event: "error", data: { message: err.message } });
      }
    });

  return controller;
}

// ─── Types ───

export interface HealthResponse {
  status: string;
  uptime: number;
  uptimeHuman: string;
  discord: {
    connected: boolean;
    username: string | null;
    ping: number | null;
  };
  stats: {
    conversations: number;
    messages: number;
    memories: number;
    activeSchedules: number;
  };
}

export interface ConversationsResponse {
  conversations: Array<{
    id: string;
    discordUserId: string | null;
    discordUsername: string | null;
    source: string;
    title: string | null;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
  }>;
  total: number;
}

export interface MessagesResponse {
  conversation: {
    id: string;
    title: string | null;
    source: string;
  };
  messages: Array<{
    id: string;
    role: string;
    content: unknown;
    model: string | null;
    tokenCount: number | null;
    createdAt: number;
  }>;
}

export interface MemoriesResponse {
  memories: Array<{
    id: string;
    content: string;
    category: string;
    source: string;
    conversationId: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
  total?: number;
}

export interface SchedulesResponse {
  schedules: Array<{
    id: string;
    type: string;
    prompt: string;
    cronExpr: string | null;
    timezone: string;
    enabled: boolean;
    nextRunAt: number;
    nextRunAtHuman: string;
    lastRunAt: number | null;
    lastRunAtHuman: string | null;
    toolsEnabled: boolean;
    createdAt: number;
  }>;
  count: number;
}

export interface ChatStreamEvent {
  event: string;
  data: Record<string, unknown>;
}
