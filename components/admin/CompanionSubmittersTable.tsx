"use client";

import { useEffect, useState } from "react";
import { Ban, UserX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import BlockSubmitterModal from "./BlockSubmitterModal";

export interface Submitter {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  suggestionsBlocked: boolean;
  suggestionsBlockedUntil: string | null;
  pending: number;
  approved: number;
  dismissed: number;
  total: number;
  dismissalRate: number;
  lastSubmittedAt: string | null;
}

interface Props {
  // When set, stats are scoped to this companion's suggestions only.
  companionId?: string;
}

/**
 * Moderator table showing who's submitted Watch Companion suggestions.
 * Used on the global /admin/watch-companions/suggestions page and again
 * scoped to a single companion on /admin/watch-companions/[id]. Blocking
 * opens a modal where the admin picks an expiry and types an optional
 * message delivered as an in-app notification.
 */
export default function CompanionSubmittersTable({ companionId }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Submitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blockTarget, setBlockTarget] = useState<Submitter | null>(null);

  async function fetchRows() {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const url = companionId
      ? `/api/admin/watch-companion/submitters?companionId=${encodeURIComponent(companionId)}`
      : `/api/admin/watch-companion/submitters`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError("Access denied or failed to load.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.submitters ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companionId]);

  async function unblock(userId: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/submitters`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, blocked: false }),
    });
    if (res.ok) {
      setRows((r) => r.map((row) => row.userId === userId
        ? { ...row, suggestionsBlocked: false, suggestionsBlockedUntil: null }
        : row));
    }
  }

  if (loading) return <p className="text-[var(--foreground-muted)] text-sm">Loading…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (rows.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">No submitters yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-2 py-2 font-medium text-right">Pending</th>
              <th className="px-2 py-2 font-medium text-right">Approved</th>
              <th className="px-2 py-2 font-medium text-right">Dismissed</th>
              <th className="px-2 py-2 font-medium text-right">Rejection</th>
              <th className="px-2 py-2 font-medium">Last</th>
              <th className="px-2 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const pct = Math.round(s.dismissalRate * 100);
              const worrying = pct >= 50 && s.dismissed + s.approved >= 3;
              const untilLabel = s.suggestionsBlockedUntil
                ? `until ${new Date(s.suggestionsBlockedUntil).toLocaleDateString()}`
                : "permanent";
              return (
                <tr key={s.userId} className="border-b border-[var(--border)]/40">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">
                        {s.name}
                        {s.suggestionsBlocked && (
                          <span className="ml-2 text-[10px] text-red-400 uppercase tracking-wider">blocked ({untilLabel})</span>
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--foreground-muted)]">{s.email}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-white">{s.pending}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-green-400">{s.approved}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-red-400">{s.dismissed}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-semibold ${worrying ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                    {s.dismissed + s.approved === 0 ? "—" : `${pct}%`}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-[var(--foreground-muted)]">
                    {s.lastSubmittedAt ? new Date(s.lastSubmittedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => s.suggestionsBlocked ? unblock(s.userId) : setBlockTarget(s)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                        s.suggestionsBlocked
                          ? "bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-green-500/50"
                          : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-500/50"
                      }`}
                      title={s.suggestionsBlocked ? "Unblock submissions" : "Block submissions"}
                    >
                      {s.suggestionsBlocked ? <><UserX className="w-3 h-3" /> Unblock</> : <><Ban className="w-3 h-3" /> Block</>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {blockTarget && (
        <BlockSubmitterModal
          submitter={blockTarget}
          onClose={() => setBlockTarget(null)}
          onBlocked={(expiresAt) => {
            setRows((r) => r.map((row) => row.userId === blockTarget.userId
              ? { ...row, suggestionsBlocked: true, suggestionsBlockedUntil: expiresAt }
              : row));
            setBlockTarget(null);
          }}
        />
      )}
    </>
  );
}
