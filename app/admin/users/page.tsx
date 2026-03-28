"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Search, Shield, ShieldOff, ExternalLink, Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isPrivate: boolean;
  createdAt: string;
  _count: { ratings: number; favoriteMovies: number };
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function fetchUsers() {
    if (!user) return;
    const token = await user.getIdToken();
    const params = new URLSearchParams();
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

  useEffect(() => { fetchUsers(); }, [user, search]);

  async function toggleAdmin(u: AdminUser) {
    if (!user || togglingId) return;
    setTogglingId(u.id);
    const token = await user.getIdToken();
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, isAdmin: !u.isAdmin }),
    });
    await fetchUsers();
    setTogglingId(null);
  }

  async function deleteUser(u: AdminUser) {
    if (!user || deletingId) return;
    setDeletingId(u.id);
    setConfirmDeleteId(null);
    const token = await user.getIdToken();
    await fetch(`/api/admin/users?userId=${u.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchUsers();
    setDeletingId(null);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading users…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="text-sm text-[var(--foreground-muted)]">{total.toLocaleString()} total</p>
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

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden sm:table-cell">Email</th>
              <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Ratings</th>
              <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden md:table-cell">Joined</th>
              <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Role</th>
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
                    <span className="text-white font-medium">{u.name}</span>
                    {u.isAdmin && <span className="text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] px-1.5 py-0.5 rounded">admin</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--foreground-muted)] hidden sm:table-cell">{u.email}</td>
                <td className="px-4 py-3 text-[var(--foreground-muted)]">
                  {u._count.ratings} rated · {u._count.favoriteMovies} seen
                </td>
                <td className="px-4 py-3 text-xs text-[var(--foreground-muted)] hidden md:table-cell">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${u.isAdmin ? "border-[var(--ratist-red)]/50 text-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] text-[var(--foreground-muted)]"}`}>
                    {u.isAdmin ? "Admin" : "Member"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Link
                      href={`/profile/${u.id}`}
                      target="_blank"
                      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                      title="View profile"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={!!togglingId || !!deletingId}
                      title={u.isAdmin ? "Remove admin" : "Make admin"}
                      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                    >
                      {u.isAdmin ? <ShieldOff className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> : <Shield className="w-3.5 h-3.5" />}
                    </button>
                    {confirmDeleteId === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={!!deletingId}
                          className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {deletingId === u.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(u.id)}
                        disabled={!!deletingId || !!togglingId}
                        title="Delete user"
                        className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-[var(--foreground-muted)] text-sm px-5 py-8 text-center">No users found.</p>
        )}
      </div>
    </div>
  );
}
