import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type ConversationsResponse,
  type MessagesResponse,
} from "../lib/api";
import {
  MessageSquare,
  Trash2,
  ChevronLeft,
  Globe,
  Bot,
  User,
} from "lucide-react";

export default function History() {
  const navigate = useNavigate();
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = () => {
    setLoading(true);
    api
      .getConversations(50)
      .then(setData)
      .finally(() => setLoading(false));
  };

  const loadMessages = (conversationId: string) => {
    setSelectedConvo(conversationId);
    api.getMessages(conversationId).then(setMessages);
  };

  const deleteConvo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await api.deleteConversation(id);
    if (selectedConvo === id) {
      setSelectedConvo(null);
      setMessages(null);
    }
    loadConversations();
  };

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading...</div>;
  }

  // Message detail view
  if (selectedConvo && messages) {
    return (
      <div className="p-8 max-w-4xl">
        <button
          onClick={() => {
            setSelectedConvo(null);
            setMessages(null);
          }}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Back to conversations
        </button>

        <h2 className="text-xl font-bold mb-1">
          {messages.conversation.title ?? "Untitled"}
        </h2>
        <p className="text-xs text-zinc-500 font-mono mb-6">
          {messages.conversation.source} &middot; {messages.conversation.id}
        </p>

        <div className="space-y-4">
          {messages.messages.map((msg) => {
            const content =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content, null, 2);

            return (
              <div key={msg.id} className="flex gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-brand-500/10 text-brand-400"
                      : msg.role === "assistant"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-400">
                      {msg.role}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                    {msg.model && (
                      <span className="text-[10px] text-zinc-600 font-mono">
                        {msg.model}
                      </span>
                    )}
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                      {content}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <button
            onClick={() => navigate(`/chat/${selectedConvo}`)}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-medium transition-colors"
          >
            Continue in Chat
          </button>
        </div>
      </div>
    );
  }

  // Conversations list
  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">
        Conversation History
        {data && (
          <span className="text-sm font-normal text-zinc-500 ml-2">
            ({data.total} total)
          </span>
        )}
      </h2>

      {data?.conversations.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No conversations yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.conversations.map((convo) => (
            <button
              key={convo.id}
              onClick={() => loadMessages(convo.id)}
              className="w-full flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 hover:bg-zinc-800/80 transition-colors text-left group"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  convo.source === "discord"
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "bg-brand-500/10 text-brand-400"
                }`}
              >
                {convo.source === "discord" ? (
                  <Globe className="w-4 h-4" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {convo.title ?? "Untitled"}
                </p>
                <p className="text-xs text-zinc-500">
                  {convo.source}
                  {convo.discordUsername && ` · ${convo.discordUsername}`}
                  {" · "}
                  {convo.messageCount} messages
                  {" · "}
                  {new Date(convo.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => deleteConvo(convo.id, e)}
                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
