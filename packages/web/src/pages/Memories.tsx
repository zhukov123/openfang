import { useEffect, useState } from "react";
import { api, type MemoriesResponse } from "../lib/api";
import { Brain, Search, Trash2, Filter } from "lucide-react";

const CATEGORIES = [
  "all",
  "preference",
  "fact",
  "project",
  "person",
  "general",
] as const;

const categoryColors: Record<string, string> = {
  preference: "bg-purple-500/10 text-purple-400",
  fact: "bg-blue-500/10 text-blue-400",
  project: "bg-green-500/10 text-green-400",
  person: "bg-amber-500/10 text-amber-400",
  general: "bg-zinc-700/50 text-zinc-400",
};

export default function Memories() {
  const [data, setData] = useState<MemoriesResponse | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const loadMemories = () => {
    setLoading(true);
    api
      .getMemories({
        q: search || undefined,
        category: category !== "all" ? category : undefined,
        limit: 100,
      })
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMemories();
  }, [category]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadMemories();
  };

  const deleteMemory = async (id: string) => {
    if (!confirm("Delete this memory?")) return;
    await api.deleteMemory(id);
    loadMemories();
  };

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">
        Memories
        {data && (
          <span className="text-sm font-normal text-zinc-500 ml-2">
            ({data.total ?? data.memories.length} total)
          </span>
        )}
      </h2>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </form>
        <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-brand-500/10 text-brand-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Memories List */}
      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : data?.memories.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">
          <Brain className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No memories found</p>
          <p className="text-sm mt-1">
            Memories are automatically extracted from conversations
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.memories.map((mem) => (
            <div
              key={mem.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                        categoryColors[mem.category] ?? categoryColors.general
                      }`}
                    >
                      {mem.category}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {mem.source === "auto" ? "auto-extracted" : "manual"}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(mem.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-200">{mem.content}</p>
                </div>
                <button
                  onClick={() => deleteMemory(mem.id)}
                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
