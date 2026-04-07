"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Search, Gift, X } from "lucide-react";

interface EligibleUser {
  id: string; name: string; email: string; reviewCount: number;
}

export default function AdminSubscriptionsPage() {
  const { user } = useAuth();
  const [eligible, setEligible] = useState<EligibleUser[]>([]);
  const [alreadyGranted, setAlreadyGranted] = useState(0);
  const [totalSubscribers, setTotalSubscribers] = useState(0);
  const [loading, setLoading] = useState(true);

  // Manual grant
  const [grantUserId, setGrantUserId] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [granting, setGranting] = useState(false);

  // User search for manual grant
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);

  async function fetchData() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/subscription", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setEligible(data.eligible ?? []);
      setAlreadyGranted(data.alreadyGranted ?? 0);
      setTotalSubscribers(data.totalSubscribers ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [user]);

  // Search users for manual grant
  useEffect(() => {
    if (!user || searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&tab=active`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSearchResults((data.users ?? []).slice(0, 5).map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email })));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, user]);

  async function grantManual() {
    if (!user || !grantUserId) return;
    setGranting(true);
    const token = await user.getIdToken();
    await fetch("/api/admin/subscription", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", userId: grantUserId, expiryDate: grantExpiry || null }),
    });
    setGrantUserId(""); setGrantExpiry(""); setSearchQuery(""); setSearchResults([]);
    fetchData();
    setGranting(false);
  }

  async function revokeGrant(userId: string) {
    if (!user || !window.confirm("Revoke this user's Backstage Pass?")) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/subscription", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", userId }),
    });
    fetchData();
  }

  async function runBulkPromo() {
    if (!user || !window.confirm(`Grant 6-month Backstage Pass to ${eligible.length} eligible users? This cannot be undone.`)) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/subscription", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_promo", limit: 1000 }),
    });
    if (res.ok) { const data = await res.json(); alert(`Granted to ${data.granted} users.`); }
    fetchData();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Ticket className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-semibold text-white">Backstage Pass Management</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalSubscribers}</p>
          <p className="text-xs text-[var(--foreground-muted)]">Active Subscribers</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{eligible.length}</p>
          <p className="text-xs text-[var(--foreground-muted)]">Promo Eligible (10+ reviews)</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{alreadyGranted}</p>
          <p className="text-xs text-[var(--foreground-muted)]">Already Promo&apos;d</p>
        </div>
      </div>

      {/* Manual grant */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-8">
        <h3 className="text-sm font-semibold text-white mb-3">Manual Grant</h3>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search user by name or email..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]" />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-10 overflow-hidden">
                {searchResults.map((u) => (
                  <button key={u.id} onClick={() => { setGrantUserId(u.id); setSearchQuery(u.name); setSearchResults([]); }}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] text-sm text-white">
                    {u.name} <span className="text-xs text-[var(--foreground-muted)]">({u.email})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="date" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} placeholder="Expiry (optional)"
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={grantManual} disabled={!grantUserId || granting}
            className="px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {granting ? "Granting..." : "Grant Backstage Pass"}
          </button>
        </div>
      </div>

      {/* Bulk promo */}
      {eligible.length > 0 && (
        <div className="bg-[var(--surface)] border border-purple-500/30 rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">First 1,000 Reviewers Promo</h3>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] mb-3">
            {eligible.length} users have 10+ Ratist rubric reviews and are eligible for 6 months free.
            {alreadyGranted > 0 && ` (${alreadyGranted} already granted)`}
          </p>
          <button onClick={runBulkPromo}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold">
            Grant 6-Month Pass to All Eligible
          </button>
        </div>
      )}
    </div>
  );
}
