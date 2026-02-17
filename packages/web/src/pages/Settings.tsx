import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Save, Loader2 } from "lucide-react";

export default function Settings() {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading config...</div>;
  }

  const toolsEnabled = (config.tools_enabled ?? {}) as Record<string, boolean>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Settings</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="space-y-6">
        {/* System Prompt */}
        <Section title="System Prompt">
          <textarea
            value={(config.system_prompt as string) ?? ""}
            onChange={(e) => updateField("system_prompt", e.target.value)}
            rows={6}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-y"
          />
        </Section>

        {/* Model */}
        <Section title="AI Model">
          <input
            type="text"
            value={(config.model as string) ?? ""}
            onChange={(e) => updateField("model", e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            placeholder="claude-sonnet-4-20250514"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Anthropic-compatible model identifier
          </p>
        </Section>

        {/* Context Window */}
        <Section title="Context Window">
          <input
            type="number"
            value={(config.max_context_messages as number) ?? 50}
            onChange={(e) =>
              updateField("max_context_messages", parseInt(e.target.value, 10))
            }
            min={1}
            max={200}
            className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Max messages loaded into context per conversation
          </p>
        </Section>

        {/* Shell Config */}
        <Section title="Shell Execution">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Default Working Directory
              </label>
              <input
                type="text"
                value={(config.shell_working_directory as string) ?? ""}
                onChange={(e) =>
                  updateField("shell_working_directory", e.target.value)
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Timeout (ms)
              </label>
              <input
                type="number"
                value={(config.shell_timeout_ms as number) ?? 30000}
                onChange={(e) =>
                  updateField("shell_timeout_ms", parseInt(e.target.value, 10))
                }
                className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
          </div>
        </Section>

        {/* Memory */}
        <Section title="Memory">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={
                (config.memory_auto_extract as boolean) ?? true
              }
              onChange={(e) =>
                updateField("memory_auto_extract", e.target.checked)
              }
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-500 focus:ring-brand-500/50"
            />
            <span className="text-sm">
              Auto-extract memories from conversations
            </span>
          </label>
        </Section>

        {/* Tool Toggles */}
        <Section title="Tools">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(toolsEnabled).map(([name, enabled]) => (
              <label
                key={name}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    updateField("tools_enabled", {
                      ...toolsEnabled,
                      [name]: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-500 focus:ring-brand-500/50"
                />
                <span className="text-sm font-mono">{name}</span>
              </label>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}
