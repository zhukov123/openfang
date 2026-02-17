import { useEffect, useState } from "react";
import { api, type HealthResponse } from "../lib/api";
import {
  Activity,
  MessageSquare,
  Brain,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      api
        .getHealth()
        .then(setHealth)
        .catch((e) => setError(e.message));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          Failed to connect to server: {error}
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="p-8 text-zinc-500">Loading...</div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={health.discord.connected ? Wifi : WifiOff}
          label="Discord"
          value={health.discord.connected ? "Connected" : "Disconnected"}
          sub={health.discord.username ?? "Not logged in"}
          color={health.discord.connected ? "green" : "red"}
        />
        <StatCard
          icon={Activity}
          label="Uptime"
          value={health.uptimeHuman}
          sub="Since last restart"
          color="blue"
        />
        <StatCard
          icon={MessageSquare}
          label="Conversations"
          value={String(health.stats.conversations)}
          sub={`${health.stats.messages} messages`}
          color="purple"
        />
        <StatCard
          icon={Brain}
          label="Memories"
          value={String(health.stats.memories)}
          sub={`${health.stats.activeSchedules} active schedules`}
          color="amber"
        />
      </div>

      {/* Discord Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">System Info</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Discord Bot</span>
            <p className="font-mono">
              {health.discord.username ?? "Not connected"}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Discord Ping</span>
            <p className="font-mono">
              {health.discord.ping != null ? `${health.discord.ping}ms` : "N/A"}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Total Messages</span>
            <p className="font-mono">{health.stats.messages}</p>
          </div>
          <div>
            <span className="text-zinc-500">Active Schedules</span>
            <p className="font-mono">{health.stats.activeSchedules}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-green-400 bg-green-400/10",
    red: "text-red-400 bg-red-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    purple: "text-purple-400 bg-purple-400/10",
    amber: "text-amber-400 bg-amber-400/10",
  };

  const classes = colorMap[color] ?? colorMap.blue;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${classes}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{sub}</p>
    </div>
  );
}
