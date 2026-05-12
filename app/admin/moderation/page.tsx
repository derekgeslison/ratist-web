"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Flag, Check, Trash2, Ban, X, AlertTriangle, Clock, ExternalLink } from "lucide-react";

interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string; avatarUrl: string | null };
  resolver: { id: string; name: string } | null;
  contentPreview: string | null;
  contentAuthor: { id: string; name: string; firebaseUid: string } | null;
}

type Tab = "pending" | "dismissed" | "removed" | "warned" | "banned";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  spoilers: "Unmarked spoilers",
  nudity: "Nudity / explicit",
  other: "Other",
};

const TYPE_LABELS: Record<string, string> = {
  review: "Review",
  comment: "Comment",
  forumPost: "Forum Post",
  hotTake: "Hot Take",
  recast: "Recast",
  looksLike: "Looks Like",
  companion_suggestion: "Companion Suggestion",
  moviePoster: "Movie Poster",
  movieMedia: "Movie Media Image",
};

export default function ModerationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [banDialogId, setBanDialogId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDays, setBanDays] = useState("");
  const [banRemoveContent, setBanRemoveContent] = useState(true);

  async function fetchReports() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/moderation?status=${tab}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { setLoading(true); fetchReports(); }, [user, tab]);

  async function resolve(reportId: string, action: string, extra?: Record<string, unknown>) {
    if (!user || actionId) return;
    setActionId(reportId);
    const token = await user.getIdToken();
    await fetch("/api/admin/moderation", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, action, ...extra }),
    });
    await fetchReports();
    setActionId(null);
    setBanDialogId(null);
  }

  const TABS: Tab[] = ["pending", "dismissed", "removed", "warned", "banned"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Flag className="w-5 h-5 text-[var(--ratist-red)]" /> Content Moderation
        </h2>
        <p className="text-sm text-[var(--foreground-muted)]">Review reported content from users.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap capitalize ${
              tab === t ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Ban dialog */}
      {banDialogId && (
        <div className="bg-[var(--surface)] border border-orange-400/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Ban className="w-4 h-4 text-orange-400" /> Ban Content Author
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Reason</label>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="e.g. Repeated spam…"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Duration (days, empty = permanent)</label>
              <input
                type="number"
                value={banDays}
                onChange={(e) => setBanDays(e.target.value)}
                placeholder="30"
                min={1}
                className="w-32 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-orange-400 [color-scheme:dark]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={banRemoveContent} onChange={(e) => setBanRemoveContent(e.target.checked)} className="rounded border-[var(--border)]" />
              <span className="text-xs text-[var(--foreground-muted)]">Remove all their content (reviews, comments, posts)</span>
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => resolve(banDialogId, "ban", { banReason, banDays: banDays || undefined, removeContent: banRemoveContent })} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold transition-colors">
                Remove Content + Ban User
              </button>
              <button onClick={() => { setBanDialogId(null); setBanReason(""); setBanDays(""); setBanRemoveContent(true); }} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-white font-medium">No {tab} reports</p>
          {tab === "pending" && <p className="text-sm text-[var(--foreground-muted)] mt-1">All clear!</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.reason === "spam" ? "bg-yellow-400/10 text-yellow-400 border border-yellow-400/30" :
                    r.reason === "harassment" ? "bg-red-400/10 text-red-400 border border-red-400/30" :
                    "bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]"
                  }`}>
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[r.targetType] ?? r.targetType}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Content preview */}
              {r.contentPreview && (
                <div className="bg-[var(--surface-2)] rounded-lg p-3 mb-3">
                  <p className="text-xs text-[var(--foreground-muted)] mb-1">Reported content:</p>
                  <p className="text-sm text-white">{r.contentPreview}</p>
                </div>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-4 text-xs text-[var(--foreground-muted)] mb-3">
                <span>
                  Reported by <span className="text-white">{r.reporter.name}</span>
                </span>
                {r.contentAuthor && (
                  <span>
                    Author: <Link href={`/profile/${r.contentAuthor.firebaseUid}`} className="text-white hover:text-[var(--ratist-red)] transition-colors">{r.contentAuthor.name}</Link>
                  </span>
                )}
                {r.details && <span>Note: &quot;{r.details}&quot;</span>}
              </div>

              {/* Resolved info */}
              {r.resolver && (
                <p className="text-xs text-[var(--foreground-muted)] mb-3">
                  Resolved by {r.resolver.name} on {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : "—"}
                </p>
              )}

              {/* Actions (only for pending) */}
              {r.status === "pending" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => resolve(r.id, "dismiss")}
                    disabled={!!actionId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-green-500 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                  {(r.targetType === "moviePoster" || r.targetType === "movieMedia") && (
                    <Link
                      href={`/movies/${r.targetId}${r.targetType === "movieMedia" ? "#media" : ""}`}
                      target="_blank"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> View movie page
                    </Link>
                  )}
                  {r.targetType === "moviePoster" && (
                    <button
                      onClick={async () => {
                        if (!user || actionId) return;
                        setActionId(r.id);
                        const token = await user.getIdToken();
                        await fetch("/api/admin/poster-block", {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ mediaType: "movie", tmdbId: Number(r.targetId), blocked: true }),
                        });
                        await fetch("/api/admin/moderation", {
                          method: "PATCH",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ reportId: r.id, action: "dismiss" }),
                        });
                        await fetchReports();
                        setActionId(null);
                      }}
                      disabled={!!actionId}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" /> Block poster
                    </button>
                  )}
                  {r.targetType === "movieMedia" && (
                    <button
                      onClick={async () => {
                        if (!user || actionId) return;
                        setActionId(r.id);
                        const token = await user.getIdToken();
                        await fetch("/api/admin/poster-block", {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ mediaType: "movie", tmdbId: Number(r.targetId), mediaBlocked: true }),
                        });
                        await fetch("/api/admin/moderation", {
                          method: "PATCH",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ reportId: r.id, action: "dismiss" }),
                        });
                        await fetchReports();
                        setActionId(null);
                      }}
                      disabled={!!actionId}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" /> Block media tab
                    </button>
                  )}
                  <button
                    onClick={() => resolve(r.id, "remove")}
                    disabled={!!actionId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" /> Remove Content
                  </button>
                  <button
                    onClick={() => resolve(r.id, "warn")}
                    disabled={!!actionId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-yellow-400 hover:border-yellow-400 transition-colors disabled:opacity-50"
                  >
                    <AlertTriangle className="w-3 h-3" /> Remove + Warn
                  </button>
                  <button
                    onClick={() => setBanDialogId(r.id)}
                    disabled={!!actionId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                  >
                    <Ban className="w-3 h-3" /> Remove + Ban
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
