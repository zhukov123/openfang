import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { streamChat, type ChatStreamEvent } from "../lib/api";
import {
  Send,
  Loader2,
  ChevronRight,
  ChevronDown,
  Wrench,
  AlertCircle,
  CheckCircle2,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ToolCall {
  toolId: string;
  toolName: string;
  input: unknown;
  result?: string;
  durationMs?: number;
  isError?: boolean;
  expanded: boolean;
}

interface TokenUsage {
  input: number;
  output: number;
}

export default function Chat() {
  const { conversationId: urlConvoId } = useParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    urlConvoId ?? null
  );
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ input: 0, output: 0 });
  const [debugOpen, setDebugOpen] = useState(true);
  const [extractedMemories, setExtractedMemories] = useState<
    Array<{ content: string; category: string }>
  >([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setToolCalls([]);
    setTokenUsage({ input: 0, output: 0 });
    setExtractedMemories([]);

    let assistantContent = "";
    const assistantId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    abortRef.current = streamChat(
      text,
      conversationId,
      (event: ChatStreamEvent) => {
        switch (event.event) {
          case "conversation_id":
            setConversationId(event.data.conversationId as string);
            break;

          case "text_delta":
            assistantContent += event.data.text as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent }
                  : m
              )
            );
            break;

          case "tool_use_start":
            setToolCalls((prev) => [
              ...prev,
              {
                toolId: event.data.toolId as string,
                toolName: event.data.toolName as string,
                input: event.data.input,
                expanded: false,
              },
            ]);
            break;

          case "tool_result":
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.toolId === event.data.toolId
                  ? {
                      ...tc,
                      result: event.data.result as string,
                      durationMs: event.data.durationMs as number,
                      isError: event.data.isError as boolean,
                    }
                  : tc
              )
            );
            break;

          case "message_complete":
            setTokenUsage({
              input: event.data.inputTokens as number,
              output: event.data.outputTokens as number,
            });
            break;

          case "memory_extracted":
            setExtractedMemories(
              event.data.facts as Array<{ content: string; category: string }>
            );
            break;

          case "done":
            setIsStreaming(false);
            break;

          case "error":
            assistantContent += `\n\nError: ${event.data.message}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent }
                  : m
              )
            );
            setIsStreaming(false);
            break;
        }
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setToolCalls([]);
    setTokenUsage({ input: 0, output: 0 });
    setExtractedMemories([]);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div>
            <h2 className="font-semibold">Chat</h2>
            {conversationId && (
              <p className="text-xs text-zinc-500 font-mono">
                {conversationId}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={newChat}
              className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              New Chat
            </button>
            <button
              onClick={() => setDebugOpen(!debugOpen)}
              className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
              title="Toggle debug panel"
            >
              {debugOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg font-medium mb-2">Start a conversation</p>
              <p className="text-sm">
                Type a message below to chat with OpenFang
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 p-4">
          <div className="flex items-end gap-3 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 placeholder-zinc-500"
              style={{
                minHeight: "44px",
                maxHeight: "200px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      {debugOpen && (
        <div className="w-80 flex-shrink-0 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-400">Debug Panel</h3>
          </div>

          {/* Token Usage */}
          {(tokenUsage.input > 0 || tokenUsage.output > 0) && (
            <div className="p-4 border-b border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
                Token Usage
              </h4>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-zinc-500">In:</span>{" "}
                  <span className="font-mono">
                    {tokenUsage.input.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Out:</span>{" "}
                  <span className="font-mono">
                    {tokenUsage.output.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls */}
          <div className="p-4 border-b border-zinc-800">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
              Tool Calls ({toolCalls.length})
            </h4>
            {toolCalls.length === 0 ? (
              <p className="text-xs text-zinc-600">No tool calls yet</p>
            ) : (
              <div className="space-y-2">
                {toolCalls.map((tc) => (
                  <ToolCallCard
                    key={tc.toolId}
                    toolCall={tc}
                    onToggle={() =>
                      setToolCalls((prev) =>
                        prev.map((t) =>
                          t.toolId === tc.toolId
                            ? { ...t, expanded: !t.expanded }
                            : t
                        )
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Extracted Memories */}
          {extractedMemories.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
                Extracted Memories
              </h4>
              <div className="space-y-2">
                {extractedMemories.map((mem, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800 rounded-lg p-2 text-xs"
                  >
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium mb-1">
                      {mem.category}
                    </span>
                    <p className="text-zinc-300">{mem.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({
  toolCall,
  onToggle,
}: {
  toolCall: ToolCall;
  onToggle: () => void;
}) {
  const isComplete = toolCall.result !== undefined;
  const isRunning = !isComplete;

  return (
    <div className="bg-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-750"
      >
        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
        ) : toolCall.isError ? (
          <AlertCircle className="w-3 h-3 text-red-400" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-green-400" />
        )}
        <Wrench className="w-3 h-3 text-zinc-500" />
        <span className="text-xs font-mono font-medium flex-1">
          {toolCall.toolName}
        </span>
        {toolCall.durationMs !== undefined && (
          <span className="text-[10px] text-zinc-500">
            {toolCall.durationMs}ms
          </span>
        )}
        {toolCall.expanded ? (
          <ChevronDown className="w-3 h-3 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-500" />
        )}
      </button>

      {toolCall.expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase">
              Input
            </p>
            <pre className="text-[11px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase">
                Result
              </p>
              <pre className="text-[11px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(toolCall.result), null, 2);
                  } catch {
                    return toolCall.result;
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
