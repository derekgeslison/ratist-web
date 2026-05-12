"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, ExternalLink, Shield, ShieldOff, Ban, Trash2, RotateCcw, AlertTriangle, Star, MessageCircle, Film, Clock } from "lucide-react";

interface UserDetail {
  id: string;
  firebaseUid: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  isAdmin: boolean;
  isPrivate: boolean;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  bannedAt: string | null;
  bannedUntil: string | null;
  banReason: string | null;
  postingBlockedAt: string | null;
  postingBlockedUntil: string | null;
  postingBlockReason: string | null;
  _count: {
    ratings: number;
    favoriteMovies: number;
    comments: number;
    forumThreads: number;
    forumPosts: number;
    hotTakes: number;
    recasts: number;
    looksLikes: number;
    screeningSessionsHosted: number;
    screeningParticipations: number;
    watchlistsOwned: number;
    reportsMade: number;
  };
}

interface RecentRating {
  id: string;
  ratistRating: number | null;
  createdAt: string;
  movie: { title: string; tmdbId: number };
}

interface RecentComment {
  id: string;
  text: string;
  targetType: string;
  createdAt: string;
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user: authUser } = useAuth();
  const [data, setData] = useState<{ user: UserDetail; reportsAgainst: number; recentRatings: RecentRating[]; recentComments: RecentComment[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [notifySent, setNotifySent] = useState(false);

  async function fetchUser() {
    if (!authUser) return;
    const token = await authUser.getIdToken();
    const res = await fetch(`/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchUser(); }, [authUser, id]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    if (!authUser || actionLoading) return;
    setActionLoading(true);
    const token = await authUser.getIdToken();
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, action, ...extra }),
    });
    await fetchUser();
    setActionLoading(false);
  }

  async function sendNotification() {
    if (!authUser || !notifyMsg.trim()) return;
    setNotifySending(true);
    const token = await authUser.getIdToken();
    const res = await fetch("/api/admin/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, message: notifyMsg.trim() }),
    });
    if (res.ok) {
      setNotifySent(true);
      setNotifyMsg("");
      setTimeout(() => setNotifySent(false), 3000);
    }
    setNotifySending(false);
  }

  if (loading) return <p className="text-[var(--foreground-muted)] py-8 text-center">Loading…</p>;
  if (!data) return <p className="text-red-400 py-8 text-center">User not found.</p>;

  const { user: u, reportsAgainst, recentRatings, recentComments } = data;
  const c = u._count;

  return (
    <div className="space-y-8">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[var(--ratist-red)] shrink-0">
          {u.avatarUrl ? (
            <Image src={u.avatarUrl} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white">{u.name[0]?.toUpperCase()}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-white">{u.name}</h2>
            {u.isAdmin && <span className="text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] px-2 py-0.5 rounded">Admin</span>}
            {u.deletedAt && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Deleted</span>}
            {u.bannedAt && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Banned</span>}
            {u.postingBlockedAt && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Posting Blocked</span>}
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">{u.email}</p>
          {u.bio && <p className="text-sm text-[var(--foreground-muted)] mt-1">{u.bio}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--foreground-muted)]">
            <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
            <span>Code: <code className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded text-white">{u.inviteCode}</code></span>
          </div>
        </div>
        <Link href={`/profile/${u.firebaseUid}`} target="_blank" className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors" title="View profile">
          <ExternalLink className="w-5 h-5" />
        </Link>
      </div>

      {/* Status alerts */}
      {u.bannedAt && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
          <p className="text-sm text-orange-400 font-semibold mb-1">Banned {u.bannedUntil ? `until ${new Date(u.bannedUntil).toLocaleDateString()}` : "permanently"}</p>
          {u.banReason && <p className="text-xs text-[var(--foreground-muted)]">Reason: {u.banReason}</p>}
        </div>
      )}
      {u.postingBlockedAt && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-sm text-yellow-400 font-semibold mb-1">
            Blocked from posting {u.postingBlockedUntil ? `until ${new Date(u.postingBlockedUntil).toLocaleDateString()}` : "until admin lifts it"}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">Can still rate movies/shows/episodes; cannot comment or post community content.</p>
          {u.postingBlockReason && <p className="text-xs text-[var(--foreground-muted)] mt-1">Reason: {u.postingBlockReason}</p>}
        </div>
      )}
      {u.deletedAt && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-sm text-red-400 font-semibold">Deleted on {new Date(u.deletedAt).toLocaleDateString()} — {Math.max(0, 30 - Math.floor((Date.now() - new Date(u.deletedAt).getTime()) / 86400000))} days until permanent deletion</p>
          <p className="text-xs text-[var(--foreground-muted)]">Deleted by: {u.deletedBy === "self" ? "Self" : u.deletedBy}</p>
        </div>
      )}

      {/* Activity stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {[
          { label: "Ratings", value: c.ratings, icon: Star },
          { label: "Seen", value: c.favoriteMovies, icon: Film },
          { label: "Comments", value: c.comments, icon: MessageCircle },
          { label: "Forum Posts", value: c.forumPosts },
          { label: "Hot Takes", value: c.hotTakes },
          { label: "Recasts", value: c.recasts },
          { label: "Looks Likes", value: c.looksLikes },
          { label: "Watchlists", value: c.watchlistsOwned },
          { label: "Screenings Hosted", value: c.screeningSessionsHosted },
          { label: "Screenings Joined", value: c.screeningParticipations },
          { label: "Reports Made", value: c.reportsMade },
          { label: "Reports Against", value: reportsAgainst, alert: reportsAgainst > 0 },
        ].map((s) => (
          <div key={s.label} className={`bg-[var(--surface)] border rounded-xl p-3 text-center ${s.alert ? "border-red-500/50" : "border-[var(--border)]"}`}>
            <p className={`text-xl font-bold ${s.alert ? "text-red-400" : "text-white"}`}>{s.value}</p>
            <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent ratings */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Recent Ratings</h3>
          {recentRatings.length === 0 ? (
            <p className="text-xs text-[var(--foreground-muted)]">No ratings yet.</p>
          ) : (
            <div className="space-y-2">
              {recentRatings.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <Link href={`/movies/${r.movie.tmdbId}`} className="text-sm text-white hover:text-[var(--ratist-red)] transition-colors truncate flex-1 mr-2">{r.movie.title}</Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.ratistRating != null && <span className="text-xs font-bold text-white">{r.ratistRating.toFixed(1)}</span>}
                    <span className="text-[10px] text-[var(--foreground-muted)]">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent comments */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Recent Comments</h3>
          {recentComments.length === 0 ? (
            <p className="text-xs text-[var(--foreground-muted)]">No comments yet.</p>
          ) : (
            <div className="space-y-2">
              {recentComments.map((c) => (
                <div key={c.id}>
                  <p className="text-sm text-white line-clamp-1">{c.text}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)]">
                    {c.targetType} · {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Admin actions */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => doAction("toggleAdmin")}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            {u.isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            {u.isAdmin ? "Remove Admin" : "Make Admin"}
          </button>

          {!u.bannedAt && !u.deletedAt && (
            <button
              onClick={() => {
                const reason = prompt("Ban reason (optional):");
                const days = prompt("Ban duration in days (empty = permanent):");
                doAction("ban", { reason, expiresAt: days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : undefined });
              }}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Ban User
            </button>
          )}

          {u.bannedAt && (
            <button
              onClick={() => doAction("unban")}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
            >
              Unban
            </button>
          )}

          {!u.postingBlockedAt && !u.deletedAt && !u.bannedAt && (
            <button
              onClick={() => {
                const reason = prompt("Block reason (optional):");
                const days = prompt("Block duration in days (empty = until you lift it):");
                doAction("block_posting", {
                  reason: reason ?? undefined,
                  expiresAt: days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : undefined,
                });
              }}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Block from Posting
            </button>
          )}

          {u.postingBlockedAt && (
            <button
              onClick={() => doAction("unblock_posting")}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
            >
              Unblock Posting
            </button>
          )}

          {!u.deletedAt && (
            <button
              onClick={() => { if (confirm(`Soft delete "${u.name}"?`)) doAction("softDelete"); }}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Soft Delete
            </button>
          )}

          {u.deletedAt && (
            <>
              <button
                onClick={() => doAction("restore")}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Restore
              </button>
              <button
                onClick={() => { if (confirm(`PERMANENTLY delete "${u.name}"? This cannot be undone!`)) doAction("permanentDelete"); }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" /> Permanent Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Send notification */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Send Notification</h3>
        <div className="flex gap-2">
          <input
            value={notifyMsg}
            onChange={(e) => setNotifyMsg(e.target.value)}
            placeholder="Message to user…"
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          <button
            onClick={sendNotification}
            disabled={notifySending || !notifyMsg.trim()}
            className="px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {notifySending ? "Sending…" : "Send"}
          </button>
        </div>
        {notifySent && <p className="text-xs text-green-400 mt-2">Notification sent.</p>}
      </div>
    </div>
  );
}
