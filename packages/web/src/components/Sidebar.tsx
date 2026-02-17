import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  History,
  Brain,
  Clock,
  Zap,
} from "lucide-react";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/history", icon: History, label: "History" },
  { to: "/schedules", icon: Clock, label: "Schedules" },
  { to: "/memories", icon: Brain, label: "Memories" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-brand-400" />
          <h1 className="text-lg font-bold tracking-tight">OpenFang</h1>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Personal AI Assistant</p>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-500/10 text-brand-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-800">
        <p className="text-xs text-zinc-600 text-center">v0.1.0</p>
      </div>
    </aside>
  );
}
