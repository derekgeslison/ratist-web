"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Search, RefreshCw, Copy, Check } from "lucide-react";

interface CodeUser {
  id: string;
  name: string;
  email: string;
  inviteCode: string;
  createdAt: string;
}

export default function InviteCodesPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<CodeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function fetchCodes() {
    if (!user) return;
    const token = await user.getIdToken();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/invite-codes?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { setLoading(true); fetchCodes(); }, [user, search]);

  async function regenerate(userId: string) {
    if (!user || regeneratingId) return;
    setRegeneratingId(userId);
    const token = await user.getIdToken();
    await fetch("/api/admin/invite-codes", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await fetchCodes();
    setRegeneratingId(null);
  }

  function copyCode(code: string, userId: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(userId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Invite Codes</h2>
          <p className="text-sm text-[var(--foreground-muted)]">View and manage user invite codes.</p>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, or code…"
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] w-64"
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

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Invite Code</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""}`}>
                  <td className="px-5 py-3 text-white font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)] hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-[var(--surface-2)] px-2 py-1 rounded text-white font-mono">{u.inviteCode}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => copyCode(u.inviteCode, u.id)}
                        className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                        title="Copy code"
                      >
                        {copiedId === u.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => regenerate(u.id)}
                        disabled={!!regeneratingId}
                        className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                        title="Regenerate code"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${regeneratingId === u.id ? "animate-spin" : ""}`} />
                      </button>
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
      )}
    </div>
  );
}
