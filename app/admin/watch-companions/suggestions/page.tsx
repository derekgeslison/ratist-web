"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Check, X, Trash2, Film, Tv, ThumbsUp, ThumbsDown, Ban, UserX, Users as UsersIcon } from "lucide-react";

interface Suggestion {
  id: string;
  action: string;
  targetType: string;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  upvoteScore: number;
  voteCount: number;
  createdAt: string;
  submitter: { id: string; name: string; avatarUrl: string | null };
  companion: { id: string; title: string; tmdbId: number; mediaType: "movie" | "tv" };
}

interface Submitter {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  suggestionsBlocked: boolean;
  pending: number;
  approved: number;
  dismissed: number;
  total: number;
  dismissalRate: number;
  lastSubmittedAt: string | null;
}

type StatusFilter = "pending" | "approved" | "dismissed";
type Tab = "queue" | "submitters";

export default function SuggestionsModerationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("queue");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [error, setError] = useState("");

  async function fetchList(status: StatusFilter) {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/suggestions?status=${status}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Access denied or failed to load.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setSuggestions(data.suggestions ?? []);
    setLoading(false);
  }

  async function fetchSubmitters() {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/submitters`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Access denied or failed to load.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setSubmitters(data.submitters ?? []);
    setLoading(false);
  }

  async function toggleBlock(userId: string, blocked: boolean) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/submitters`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, blocked }),
    });
    if (res.ok) {
      setSubmitters((rows) => rows.map((r) => r.userId === userId ? { ...r, suggestionsBlocked: blocked } : r));
    }
  }

  useEffect(() => {
    if (tab === "queue") fetchList(filter);
    else fetchSubmitters();
  }, [user, tab, filter]);

  async function resolve(id: string, status: "approved" | "dismissed") {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/suggestions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setSuggestions((s) => s.filter((x) => x.id !== id));
  }

  async function nuke(id: string) {
    if (!user || !confirm("Delete this suggestion outright? The submitter won't see it again.")) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/suggestions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSuggestions((s) => s.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/watch-companions" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">Companion Suggestions</h2>
      </div>

      <nav className="flex gap-1 border-b border-[var(--border)] mb-4">
        {([
          { key: "queue" as const, label: "Queue", icon: Check },
          { key: "submitters" as const, label: "Submitters", icon: UsersIcon },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === key
                ? "border-[var(--ratist-red)] text-white"
                : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === "queue" && (
      <div className="flex items-center gap-2 mb-4">
        {(["pending", "approved", "dismissed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === s
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : tab === "submitters" ? (
        submitters.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">No submitters yet.</p>
          </div>
        ) : (
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
                {submitters.map((s) => {
                  const pct = Math.round(s.dismissalRate * 100);
                  const worrying = pct >= 50 && s.dismissed + s.approved >= 3;
                  return (
                    <tr key={s.userId} className="border-b border-[var(--border)]/40">
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="text-white font-medium">{s.name}{s.suggestionsBlocked && <span className="ml-2 text-[10px] text-red-400 uppercase tracking-wider">blocked</span>}</span>
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
                          onClick={() => toggleBlock(s.userId, !s.suggestionsBlocked)}
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
        )
      ) : suggestions.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">No {filter} suggestions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <ThumbsUp className="w-3.5 h-3.5 text-green-400/60" />
                  <span className={`text-sm font-bold ${s.upvoteScore > 0 ? "text-green-400" : s.upvoteScore < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                    {s.upvoteScore > 0 ? "+" : ""}{s.upvoteScore}
                  </span>
                  <ThumbsDown className="w-3.5 h-3.5 text-red-400/60" />
                  <span className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{s.voteCount} {s.voteCount === 1 ? "vote" : "votes"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)]">
                      {s.companion.mediaType === "tv" ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                      <Link href={`/admin/watch-companions/${s.companion.id}`} className="hover:text-white">
                        {s.companion.title}
                      </Link>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold">
                      {s.action} {s.targetType.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </span>
                    <span className="text-[10px] text-[var(--foreground-muted)]">by {s.submitter.name}</span>
                    <span className="text-[10px] text-[var(--foreground-muted)] ml-auto">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                  {s.rationale && <p className="text-sm text-white mb-1">{s.rationale}</p>}
                  {s.payload && Object.keys(s.payload).length > 0 && (
                    <details>
                      <summary className="text-[10px] text-[var(--foreground-muted)] cursor-pointer hover:text-white">payload</summary>
                      <pre className="text-[10px] text-[var(--foreground-muted)] bg-[var(--surface-2)] rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(s.payload, null, 2)}</pre>
                    </details>
                  )}
                </div>
                {filter === "pending" && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => resolve(s.id, "approved")}
                      className="p-1.5 rounded text-green-400 hover:bg-green-500/10 transition-colors"
                      title="Approve + apply"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => resolve(s.id, "dismissed")}
                      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => nuke(s.id)}
                      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
