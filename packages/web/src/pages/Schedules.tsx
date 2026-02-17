import { useEffect, useState } from "react";
import { api, type SchedulesResponse } from "../lib/api";
import { Clock, Repeat, Bell, Calendar } from "lucide-react";

export default function Schedules() {
  const [data, setData] = useState<SchedulesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSchedules()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading...</div>;
  }

  const schedules = data?.schedules ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">
        Schedules & Reminders
        {data && (
          <span className="text-sm font-normal text-zinc-500 ml-2">
            ({data.count} total)
          </span>
        )}
      </h2>

      {schedules.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">
          <Clock className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No scheduled tasks or reminders</p>
          <p className="text-sm mt-1">
            Ask the bot in Chat, e.g. &quot;Remind me in 10 minutes&quot; or
            &quot;Every day at 9am, give me a news summary&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    s.type === "reminder"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-brand-500/10 text-brand-400"
                  }`}
                >
                  {s.type === "reminder" ? (
                    <Bell className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-400 uppercase">
                      {s.type === "reminder" ? "Reminder" : "Recurring"}
                    </span>
                    {!s.enabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                        Disabled
                      </span>
                    )}
                    {s.type === "cron" && s.cronExpr && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {s.cronExpr}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-200 mb-2">{s.prompt}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Next: {new Date(s.nextRunAt).toLocaleString()} ({s.timezone})
                    </span>
                    {s.lastRunAt != null && (
                      <span>
                        Last run: {new Date(s.lastRunAt).toLocaleString()}
                      </span>
                    )}
                    {s.type === "cron" && (
                      <span>
                        Tools: {s.toolsEnabled ? "on" : "off"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
