"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Flame, ThumbsUp, ThumbsDown, Plus, X, Clock, TrendingUp, MessageCircle, Trash2 } from "lucide-react";
import CommentSection from "@/components/CommentSection";

interface HotTakeItem {
  id: string;
  content: string;
  createdAt: string;
  score: number;
  commentCount: number;
  voterIds: { userId: string; value: number }[];
  author: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

type SortMode = "newest" | "score";

export default function HotTakesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<HotTakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [showForm, setShowForm] = useState(false);
  const [newTake, setNewTake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [votingId, setVotingId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/community/hot-takes");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  // Check admin status
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then((d) => { if (d.isAdmin) setIsAdmin(true); })
        .catch(() => {});
    });
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const sorted = [...items].sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  async function vote(itemId: string, value: 1 | -1) {
    if (!user || votingId) return;
    setVotingId(itemId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/community/hot-takes/${itemId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const { score, userVote } = await res.json();
        setItems((prev) => prev.map((it) =>
          it.id === itemId
            ? { ...it, score, voterIds: [...it.voterIds.filter((v) => v.userId !== user.uid), { userId: user.uid, value: userVote }] }
            : it
        ));
      }
    } finally {
      setVotingId(null);
    }
  }

  async function submitTake() {
    if (!newTake.trim() || !user) return;
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/community/hot-takes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: newTake }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); setSubmitting(false); return; }
    setItems((prev) => [data.item, ...prev]);
    setNewTake("");
    setShowForm(false);
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    setDeletingId(id);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/community/hot-takes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-orange-400" />
          <h1 className="text-2xl font-bold text-white">Hot Takes</h1>
        </div>
        {user && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Drop a Take
          </button>
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Share your spiciest movie opinions. The community decides: hot or not.</p>

      {/* Submit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-orange-400/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Drop a Hot Take</h2>
            <button onClick={() => { setShowForm(false); setNewTake(""); setError(""); }}>
              <X className="w-5 h-5 text-[var(--foreground-muted)]" />
            </button>
          </div>
          <textarea
            value={newTake}
            onChange={(e) => setNewTake(e.target.value.slice(0, 280))}
            placeholder="Your spiciest movie opinion… (max 280 chars)"
            rows={3}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--foreground-muted)] resize-none focus:outline-none focus:border-orange-400"
          />
          <div className="flex items-center justify-between mt-3">
            <span className={`text-xs ${newTake.length > 240 ? "text-orange-400" : "text-[var(--foreground-muted)]"}`}>
              {newTake.length}/280
            </span>
            <div className="flex items-center gap-2">
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                onClick={submitTake}
                disabled={!newTake.trim() || submitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <Flame className="w-3.5 h-3.5" /> {submitting ? "Posting…" : "Drop It"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-orange-400 hover:underline">Sign in</Link> to drop your hot takes and vote.
          </p>
        </div>
      )}

      {/* Sort controls */}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--foreground-muted)]">Sort:</span>
          <button
            onClick={() => setSort("newest")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "newest" ? "bg-orange-500 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <Clock className="w-3 h-3" /> Newest
          </button>
          <button
            onClick={() => setSort("score")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "score" ? "bg-orange-500 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <TrendingUp className="w-3 h-3" /> Hottest
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No hot takes yet. Be the first to start the fire!</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            const isHot = item.score > 0;
            const canDelete = user && (user.uid === item.author.firebaseUid || isAdmin);
            return (
              <div key={item.id} className={`bg-[var(--surface)] border rounded-xl p-4 ${isHot ? "border-orange-400/30" : "border-[var(--border)]"}`}>
                {/* Delete confirmation */}
                {confirmingDeleteId === item.id && (
                  <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <span className="text-sm text-red-400 flex-1">Delete this hot take?</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      disabled={deletingId === item.id}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="px-3 py-1 bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white text-xs font-semibold rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  {item.author.avatarUrl ? (
                    <Image src={item.author.avatarUrl} alt={item.author.name} width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-sm font-bold text-white">
                      {item.author.name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/profile/${item.author.firebaseUid}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)]">{item.author.name}</Link>
                    <span className="text-xs text-[var(--foreground-muted)]">{new Date(item.createdAt).toLocaleDateString()}</span>
                    {isHot && item.score >= 5 && <Flame className="w-3.5 h-3.5 text-orange-400" />}
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">{item.content}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => vote(item.id, 1)}
                      disabled={!user || votingId === item.id}
                      className={`flex items-center gap-1 text-xs transition-colors ${userVote === 1 ? "text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> Hot
                    </button>
                    <span className={`text-sm font-bold ${item.score > 0 ? "text-orange-400" : "text-[var(--foreground-muted)]"}`}>
                      {item.score > 0 ? "+" : ""}{item.score}
                    </span>
                    <button
                      onClick={() => vote(item.id, -1)}
                      disabled={!user || votingId === item.id}
                      className={`flex items-center gap-1 text-xs transition-colors ${userVote === -1 ? "text-blue-400" : "text-[var(--foreground-muted)] hover:text-blue-400"}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Not
                    </button>
                    {item.voterIds.length > 0 && (
                      <span className="text-xs text-[var(--foreground-muted)]">{item.voterIds.length} vote{item.voterIds.length !== 1 ? "s" : ""}</span>
                    )}
                    <button
                      onClick={() => setExpandedComments(expandedComments === item.id ? null : item.id)}
                      className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors ml-auto"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {expandedComments === item.id ? "Hide" : "Comments"}
                      {item.commentCount > 0 && (
                        <span className="text-xs text-[var(--foreground-muted)]">({item.commentCount})</span>
                      )}
                    </button>
                    {canDelete && confirmingDeleteId !== item.id && (
                      <button
                        onClick={() => setConfirmingDeleteId(item.id)}
                        className="p-1.5 text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {expandedComments === item.id && (
                    <CommentSection targetType="hottake" targetId={item.id} isAdmin={isAdmin} />
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
