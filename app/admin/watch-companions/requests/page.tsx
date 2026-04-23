"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Check, X, Film, Tv, Hourglass, Clock, Sparkles } from "lucide-react";

interface Request {
  id: string;
  requesterId: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  season: number | null;
  rationale: string | null;
  status: string;
  denyReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  title: string | null;
  requester: { id: string; name: string; email: string; avatarUrl: string | null };
}

type StatusFilter = "pending" | "approved" | "denied" | "fulfilled";

export default function CompanionRequestsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Request[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchList(status: StatusFilter) {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/watch-companion/requests?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Access denied or request failed.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setRows(data.requests ?? []);
      setLoading(false);
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(filter); }, [user, filter]);

  async function resolve(id: string, status: "approved" | "denied", denyReason?: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/requests`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, denyReason }),
    });
    if (res.ok) setRows((r) => r.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/watch-companions" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">Companion Generation Requests</h2>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(["pending", "approved", "denied", "fulfilled"] as const).map((s) => (
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

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">No {filter} requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const generateHref = `/admin/watch-companions/new?tmdbId=${r.tmdbId}&mediaType=${r.mediaType}${r.season ? `&season=${r.season}` : ""}`;
            return (
              <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <Hourglass className="w-4 h-4 text-[var(--ratist-red)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {r.mediaType === "tv" ? <Tv className="w-3 h-3 text-[var(--foreground-muted)]" /> : <Film className="w-3 h-3 text-[var(--foreground-muted)]" />}
                      <span className="text-sm font-semibold text-white truncate">
                        {r.title ?? `TMDB ${r.tmdbId}`}
                        {r.season && <span className="text-[var(--foreground-muted)] font-normal"> · S{r.season}</span>}
                      </span>
                      <span className="text-[10px] text-[var(--foreground-muted)]">by {r.requester.name}</span>
                      <span className="text-[10px] text-[var(--foreground-muted)] ml-auto flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {r.rationale && <p className="text-xs text-[var(--foreground-muted)] italic mt-1 leading-relaxed">&ldquo;{r.rationale}&rdquo;</p>}
                    {r.denyReason && <p className="text-xs text-red-400 italic mt-1 leading-relaxed">Denied: {r.denyReason}</p>}
                  </div>
                  {filter === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <Link
                        href={generateHref}
                        onClick={() => resolve(r.id, "approved")}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--ratist-red)] text-white rounded text-[11px] font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
                        title="Approve + open generator with this title prefilled"
                      >
                        <Sparkles className="w-3 h-3" /> Approve + generate
                      </Link>
                      <button
                        onClick={() => {
                          const reason = prompt("Optional deny reason (visible to requester):") ?? "";
                          resolve(r.id, "denied", reason || undefined);
                        }}
                        className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Deny"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {filter !== "pending" && (
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${
                      filter === "approved" ? "text-green-400" : filter === "fulfilled" ? "text-blue-400" : "text-red-400"
                    }`}>
                      {filter === "fulfilled" && <Check className="inline w-3 h-3 mr-1" />}
                      {filter}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
