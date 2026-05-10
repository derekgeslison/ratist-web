"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Check, X, MessageSquare } from "lucide-react";

interface InviteCodeRequest {
  id: string;
  status: string;
  reason: string | null;
  oldCode: string | null;
  newCode: string | null;
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: {
    id: string;
    firebaseUid: string;
    name: string;
    avatarUrl: string | null;
    inviteCode: string;
  };
  resolver: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
  denied: "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
};

export default function AdminInviteCodeRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<InviteCodeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "denied" | "all">("pending");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"approve" | "deny" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const url = filter === "all" ? "/api/admin/invite-code-requests" : `/api/admin/invite-code-requests?status=${filter}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setRequests(data.requests ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  function startAction(id: string, action: "approve" | "deny") {
    setActiveId(id);
    setActiveAction(action);
    setAdminNotes("");
  }

  function cancelAction() {
    setActiveId(null);
    setActiveAction(null);
    setAdminNotes("");
  }

  async function submitAction() {
    if (!user || !activeId || !activeAction) return;
    setSubmitting(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/invite-code-requests/${activeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: activeAction, adminNotes: adminNotes.trim() || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      cancelAction();
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-[var(--ratist-red)]" />
          <h2 className="text-lg font-semibold text-white">Invite Code Requests</h2>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {(["pending", "approved", "denied", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? "bg-[var(--ratist-red)]/10 text-white border border-[var(--ratist-red)]/40"
                : "bg-[var(--surface)] text-[var(--foreground-muted)] border border-[var(--border)] hover:text-white"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">No requests in this view.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Link href={`/profile/${r.user.firebaseUid}`} className="shrink-0">
                  {r.user.avatarUrl ? (
                    <Image src={r.user.avatarUrl} alt="" width={40} height={40} className="rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-sm font-bold text-white">
                      {r.user.name[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link href={`/profile/${r.user.firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                      {r.user.name}
                    </Link>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-[var(--surface-2)] text-[var(--foreground-muted)]"}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-[var(--foreground-muted)]">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mb-1">
                    Current code: <code className="font-mono text-white">{r.user.inviteCode}</code>
                    {r.newCode && (
                      <>
                        {" → "}
                        <code className="font-mono text-green-400">{r.newCode}</code>
                      </>
                    )}
                  </p>
                  {r.reason && (
                    <div className="mt-2 bg-[var(--surface-2)] rounded-md px-3 py-2">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Reason</p>
                      <p className="text-sm text-white whitespace-pre-wrap">{r.reason}</p>
                    </div>
                  )}
                  {r.adminNotes && (
                    <div className="mt-2 bg-[var(--surface-2)] rounded-md px-3 py-2">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">
                        Admin notes{r.resolver?.name ? ` · ${r.resolver.name}` : ""}
                      </p>
                      <p className="text-sm text-white whitespace-pre-wrap">{r.adminNotes}</p>
                    </div>
                  )}
                </div>

                {r.status === "pending" && activeId !== r.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startAction(r.id, "approve")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => startAction(r.id, "deny")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg text-xs font-medium transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Deny
                    </button>
                  </div>
                )}
              </div>

              {/* Inline action confirmation with optional admin notes */}
              {activeId === r.id && activeAction && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                  <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" />
                    Optional message to the user (shown in their notification):
                  </p>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder={activeAction === "approve" ? "e.g. Welcome to your fresh code!" : "e.g. We don't rotate codes more than once a month."}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={submitAction}
                      disabled={submitting}
                      className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                        activeAction === "approve"
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                          : "bg-red-500 hover:bg-red-600 text-white"
                      }`}
                    >
                      {submitting ? "…" : activeAction === "approve" ? "Confirm approval" : "Confirm denial"}
                    </button>
                    <button onClick={cancelAction} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
