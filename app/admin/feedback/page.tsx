"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { MessageCircle, ChevronDown } from "lucide-react";

interface FeedbackItem {
  id: string;
  category: string;
  message: string;
  email: string | null;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  user: { name: string; firebaseUid: string } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug Report",
  inaccurate_info: "Inaccurate Info",
  feature_request: "Feature Request",
  account_issue: "Account Issue",
  content_issue: "Content Issue",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-gray-500/20 text-gray-400",
};

export default function AdminFeedbackPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState("resolved");

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/admin/feedback", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setItems(data.items ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  async function submitReply(id: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, reply: replyText, status: replyStatus }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems((prev) => prev.map((i) => i.id === id ? data.item : i));
      setReplyId(null);
      setReplyText("");
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems((prev) => prev.map((i) => i.id === id ? data.item : i));
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Feedback</h1>
        <span className="text-sm text-[var(--foreground-muted)]">({items.filter((i) => i.status === "open").length} open)</span>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] py-10 text-center">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] py-10 text-center">No feedback submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? STATUS_COLORS.open}`}>
                    {item.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => updateStatus(item.id, e.target.value)}
                    className="appearance-none bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white cursor-pointer pr-6"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)] pointer-events-none" />
                </div>
              </div>

              <div className="text-xs text-[var(--foreground-muted)] mb-2">
                {item.user ? (
                  <Link href={`/profile/${item.user.firebaseUid}`} className="text-white hover:text-[var(--ratist-red)]">{item.user.name}</Link>
                ) : (
                  <span>{item.email ?? "Anonymous"}</span>
                )}
              </div>

              <p className="text-sm text-white/90 whitespace-pre-wrap mb-3">{item.message}</p>

              {item.adminReply && (
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 mb-2">
                  <p className="text-[10px] text-[var(--foreground-muted)] mb-1">Admin Reply · {item.repliedAt ? new Date(item.repliedAt).toLocaleDateString() : ""}</p>
                  <p className="text-sm text-white/90 whitespace-pre-wrap">{item.adminReply}</p>
                </div>
              )}

              {replyId === item.id ? (
                <div className="mt-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a response to this feedback..."
                    rows={3}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-2"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)} className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white">
                      <option value="resolved">Mark Resolved</option>
                      <option value="in_progress">Mark In Progress</option>
                      <option value="closed">Close</option>
                    </select>
                    <button onClick={() => setReplyId(null)} className="text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                    <button onClick={() => submitReply(item.id)} disabled={!replyText.trim()} className="text-xs bg-[var(--ratist-red)] text-white px-3 py-1 rounded-full disabled:opacity-40">Send</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setReplyId(item.id); setReplyText(item.adminReply ?? ""); setReplyStatus("resolved"); }} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                  {item.adminReply ? "Edit Reply" : "Reply"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
