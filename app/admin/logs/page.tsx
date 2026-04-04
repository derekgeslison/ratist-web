"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Clock, Shield, Ban, Trash2, RotateCcw, Bell, Flag, AlertTriangle } from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  admin: { name: string };
}

const ACTION_META: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  toggleAdmin: { icon: Shield, color: "text-purple-400", label: "Toggle Admin" },
  softDelete: { icon: Trash2, color: "text-red-400", label: "Soft Delete" },
  restore: { icon: RotateCcw, color: "text-green-400", label: "Restore" },
  permanentDelete: { icon: AlertTriangle, color: "text-red-500", label: "Permanent Delete" },
  ban: { icon: Ban, color: "text-orange-400", label: "Ban" },
  unban: { icon: Ban, color: "text-green-400", label: "Unban" },
  resolveReport: { icon: Flag, color: "text-yellow-400", label: "Resolve Report" },
  notify: { icon: Bell, color: "text-blue-400", label: "Notify User" },
};

export default function AdminLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch("/api/admin/logs", { headers: { Authorization: `Bearer ${token}` } })
    ).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Activity Log</h2>
        <p className="text-sm text-[var(--foreground-muted)]">All admin actions are recorded here.</p>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">No actions logged yet.</p>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            const meta = ACTION_META[log.action] ?? { icon: Clock, color: "text-[var(--foreground-muted)]", label: log.action };
            const Icon = meta.icon;
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium">{log.admin.name}</span>
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  </div>
                  {log.details && <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{log.details}</p>}
                </div>
                <span className="text-[10px] text-[var(--foreground-muted)] shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
