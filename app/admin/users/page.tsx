"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Search, Shield, ShieldOff, ExternalLink, Trash2, RotateCcw, Ban, Clock, AlertTriangle } from "lucide-react";

interface AdminUser {
  id: string;
  firebaseUid: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isPrivate: boolean;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  bannedAt: string | null;
  bannedUntil: string | null;
  banReason: string | null;
  _count: { ratings: number; favoriteMovies: number };
}

type Tab = "active" | "deleted" | "blocked";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("active");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [banDialog, setBanDialog] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDays, setBanDays] = useState("");
  const [banRemoveContent, setBanRemoveContent] = useState(false);

  async function fetchUsers() {
    if (!user) return;
    const token = await user.getIdToken();
    const params = new URLSearchParams({ tab });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => { setLoading(true); fetchUsers(); }, [user, tab, search]);

  async function doAction(userId: string, action: string, extra?: Record<string, unknown>) {
    if (!user || actionId) return;
    setActionId(userId);
    setConfirmAction(null);
    const token = await user.getIdToken();
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    await fetchUsers();
    setActionId(null);
  }

  function submitBan(userId: string) {
    const expiresAt = banDays ? new Date(Date.now() + Number(banDays) * 86400000).toISOString() : undefined;
    doAction(userId, "ban", { reason: banReason || undefined, expiresAt, removeContent: banRemoveContent });
    setBanDialog(null);
    setBanReason("");
    setBanDays("");
    setBanRemoveContent(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  function daysUntilPurge(deletedAt: string): number {
    return Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000));
  }

  function formatBanExpiry(bannedUntil: string | null): string {
    if (!bannedUntil) return "Permanent";
    const d = new Date(bannedUntil);
    if (d.getTime() < Date.now()) return "Expired";
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return `${days} day${days !== 1 ? "s" : ""} left`;
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "active", label: "Active" },
    { key: "deleted", label: "Deleted" },
    { key: "blocked", label: "Blocked" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="text-sm text-[var(--foreground-muted)]">{total.toLocaleString()} {tab}</p>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] w-56"
            />
          </div>
          <button type="submit" className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white hover:border-[var(--ratist-red)] transition-colors">
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(""); setSearchInput(""); }} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${
              tab === t.key ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ban dialog */}
      {banDialog && (
        <div className="bg-[var(--surface)] border border-orange-400/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Ban className="w-4 h-4 text-orange-400" /> Ban User
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Reason (optional)</label>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="e.g. Spam, harassment…"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Duration (days, leave empty for permanent)</label>
              <input
                type="number"
                value={banDays}
                onChange={(e) => setBanDays(e.target.value)}
                placeholder="e.g. 30"
                min={1}
                className="w-32 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-orange-400 [color-scheme:dark]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={banRemoveContent} onChange={(e) => setBanRemoveContent(e.target.checked)} className="rounded border-[var(--border)]" />
              <span className="text-xs text-[var(--foreground-muted)]">Also remove all their content (reviews, comments, posts)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => submitBan(banDialog)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Confirm Ban
              </button>
              <button
                onClick={() => { setBanDialog(null); setBanReason(""); setBanDays(""); }}
                className="px-4 py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm px-5 py-8 text-center">
          No {tab} users found.
        </p>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Stats</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden md:table-cell">
                  {tab === "deleted" ? "Deleted" : tab === "blocked" ? "Banned" : "Joined"}
                </th>
                {tab === "blocked" && (
                  <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden lg:table-cell">Reason</th>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative w-7 h-7 rounded-full overflow-hidden bg-[var(--ratist-red)] shrink-0">
                        {u.avatarUrl ? (
                          <Image src={u.avatarUrl} alt="" fill sizes="28px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                            {u.name[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <Link href={`/admin/users/${u.id}`} className="text-white font-medium hover:text-[var(--ratist-red)] transition-colors">{u.name}</Link>
                      {u.isAdmin && <span className="text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] px-1.5 py-0.5 rounded">admin</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)] hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {u._count.ratings} rated · {u._count.favoriteMovies} seen
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--foreground-muted)] hidden md:table-cell">
                    {tab === "deleted" && u.deletedAt ? (
                      <span className="flex items-center gap-1 text-red-400">
                        <Clock className="w-3 h-3" /> {daysUntilPurge(u.deletedAt)}d until purge
                      </span>
                    ) : tab === "blocked" && u.bannedAt ? (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Clock className="w-3 h-3" /> {formatBanExpiry(u.bannedUntil)}
                      </span>
                    ) : (
                      new Date(u.createdAt).toLocaleDateString()
                    )}
                  </td>
                  {tab === "blocked" && (
                    <td className="px-4 py-3 text-xs text-[var(--foreground-muted)] hidden lg:table-cell">
                      {u.banReason || "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link
                        href={`/profile/${u.firebaseUid}`}
                        target="_blank"
                        className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                        title="View profile"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      {/* Active tab actions */}
                      {tab === "active" && (
                        <>
                          <button
                            onClick={() => doAction(u.id, "toggleAdmin")}
                            disabled={!!actionId}
                            title={u.isAdmin ? "Remove admin" : "Make admin"}
                            className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                          >
                            {u.isAdmin ? <ShieldOff className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> : <Shield className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setBanDialog(u.id)}
                            disabled={!!actionId}
                            title="Ban user"
                            className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-orange-400 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          {confirmAction?.id === u.id && confirmAction.action === "softDelete" ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => doAction(u.id, "softDelete")} disabled={!!actionId} className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                                {actionId === u.id ? "…" : "Confirm"}
                              </button>
                              <button onClick={() => setConfirmAction(null)} className="px-2 py-1 rounded text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ id: u.id, action: "softDelete" })}
                              disabled={!!actionId}
                              title="Delete user (30-day soft delete)"
                              className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}

                      {/* Deleted tab actions */}
                      {tab === "deleted" && (
                        <>
                          <button
                            onClick={() => doAction(u.id, "restore")}
                            disabled={!!actionId}
                            title="Restore user"
                            className="p-1.5 rounded text-green-400 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          {confirmAction?.id === u.id && confirmAction.action === "permanentDelete" ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => doAction(u.id, "permanentDelete")} disabled={!!actionId} className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                                {actionId === u.id ? "…" : "Permanent"}
                              </button>
                              <button onClick={() => setConfirmAction(null)} className="px-2 py-1 rounded text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ id: u.id, action: "permanentDelete" })}
                              disabled={!!actionId}
                              title="Permanently delete (cannot be undone)"
                              className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}

                      {/* Blocked tab actions */}
                      {tab === "blocked" && (
                        <button
                          onClick={() => doAction(u.id, "unban")}
                          disabled={!!actionId}
                          title="Unban user"
                          className="px-3 py-1 rounded text-xs border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                        >
                          Unban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
