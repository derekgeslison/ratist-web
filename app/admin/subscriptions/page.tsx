"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Search, Gift, X, Trophy, Check } from "lucide-react";

interface EligibleUser {
  id: string; name: string; email: string; reviewCount: number;
}
interface Subscriber {
  id: string; name: string; email: string; subscriptionStatus: string | null; subscriptionExpiry: string | null; grantedPromo: string | null; stripeSubscriptionId: string | null;
}

export default function AdminSubscriptionsPage() {
  const { user } = useAuth();
  const [eligible, setEligible] = useState<EligibleUser[]>([]);
  const [alreadyGranted, setAlreadyGranted] = useState(0);
  const [totalSubscribers, setTotalSubscribers] = useState(0);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoLimit, setPromoLimit] = useState("12");

  // Manual grant
  const [grantUserId, setGrantUserId] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [granting, setGranting] = useState(false);

  // Raffle
  const [raffleEligible, setRaffleEligible] = useState<EligibleUser[]>([]);
  const [raffleWinners, setRaffleWinners] = useState(0);
  const [usersWithTenPlus, setUsersWithTenPlus] = useState(0);
  const [usersWithHundredPlus, setUsersWithHundredPlus] = useState(0);
  const [raffleConditionsMet, setRaffleConditionsMet] = useState(false);
  const [raffleCount, setRaffleCount] = useState("10");
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<string | null>(null);

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
      setSubscribers(data.subscribers ?? []);
      setRaffleEligible(data.raffleEligible ?? []);
      setRaffleWinners(data.raffleWinners ?? 0);
      setUsersWithTenPlus(data.usersWithTenPlus ?? 0);
      setUsersWithHundredPlus(data.usersWithHundredPlus ?? 0);
      setRaffleConditionsMet(data.raffleConditionsMet ?? false);
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
    const count = parseInt(promoLimit, 10) || 12;
    if (!user || !window.confirm(`Grant 6-month Backstage Pass to up to ${count} eligible users? They will receive an email and notification.`)) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/subscription", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_promo", limit: count }),
    });
    if (res.ok) { const data = await res.json(); alert(`Granted to ${data.granted} users (${data.total - data.granted} were already granted).`); }
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
          <div className="flex items-center gap-3">
            <input type="number" value={promoLimit} onChange={(e) => setPromoLimit(e.target.value)} min="1" max="1000"
              className="w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white text-center" />
            <button onClick={runBulkPromo}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold">
              Grant to Next {promoLimit || "12"} Eligible
            </button>
          </div>
        </div>
      )}

      {/* 100 Reviews Raffle */}
      <div className="bg-[var(--surface)] border border-amber-500/30 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">100 Reviews Lifetime Raffle</h3>
        </div>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          10 random users who complete 100+ Ratist ratings win a <strong className="text-white">lifetime Backstage Pass</strong>.
        </p>

        {/* Conditions */}
        <div className="bg-[var(--surface-2)] rounded-lg p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Raffle Conditions</p>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${usersWithTenPlus >= 1000 ? "bg-emerald-500/20 text-emerald-400" : "bg-[var(--surface)] text-[var(--foreground-muted)]"}`}>
              {usersWithTenPlus >= 1000 ? <Check className="w-3 h-3" /> : "1"}
            </span>
            <span className="text-sm text-[var(--foreground-muted)]">
              1,000 users with 10+ reviews: <strong className={usersWithTenPlus >= 1000 ? "text-emerald-400" : "text-white"}>{usersWithTenPlus.toLocaleString()}/1,000</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${usersWithHundredPlus >= 10 ? "bg-emerald-500/20 text-emerald-400" : "bg-[var(--surface)] text-[var(--foreground-muted)]"}`}>
              {usersWithHundredPlus >= 10 ? <Check className="w-3 h-3" /> : "2"}
            </span>
            <span className="text-sm text-[var(--foreground-muted)]">
              10 users with 100+ reviews: <strong className={usersWithHundredPlus >= 10 ? "text-emerald-400" : "text-white"}>{usersWithHundredPlus}/10</strong>
            </span>
          </div>
          {raffleWinners > 0 && (
            <p className="text-xs text-[var(--foreground-muted)] pt-1">{raffleWinners}/10 winners already drawn</p>
          )}
        </div>

        {raffleEligible.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-[var(--foreground-muted)] mb-2">Eligible users:</p>
            <div className="flex flex-wrap gap-2">
              {raffleEligible.map((u) => (
                <span key={u.id} className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2.5 py-1 text-white">
                  {u.name} <span className="text-[var(--foreground-muted)]">({u.reviewCount} reviews)</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {raffleWinners < 10 && raffleConditionsMet && raffleEligible.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--foreground-muted)]">Draw</span>
            <input type="number" value={raffleCount} onChange={(e) => setRaffleCount(e.target.value)} min="1" max={Math.min(10 - raffleWinners, raffleEligible.length)}
              className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white text-center" />
            <span className="text-xs text-[var(--foreground-muted)]">winner{raffleCount !== "1" ? "s" : ""}</span>
            <button
              onClick={async () => {
                if (!user || drawing) return;
                const count = parseInt(raffleCount, 10) || 1;
                if (!window.confirm(`Randomly draw ${count} lifetime Backstage Pass winner${count !== 1 ? "s" : ""} from ${raffleEligible.length} eligible users? This cannot be undone.`)) return;
                setDrawing(true);
                setDrawResult(null);
                const token = await user.getIdToken();
                const res = await fetch("/api/admin/subscription", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "raffle_draw", limit: count }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setDrawResult(`${data.granted} winner${data.granted !== 1 ? "s" : ""}: ${data.winners.join(", ")}`);
                  fetchData();
                } else {
                  const data = await res.json().catch(() => ({}));
                  setDrawResult(`Error: ${data.error ?? "Failed"}`);
                }
                setDrawing(false);
              }}
              disabled={drawing || raffleEligible.length === 0}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {drawing ? "Drawing..." : "Draw Winners"}
            </button>
          </div>
        )}
        {drawResult && <p className="mt-3 text-sm text-amber-400">{drawResult}</p>}
      </div>

      {/* Active subscribers list */}
      {subscribers.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-white">Active Subscribers ({subscribers.length})</h3>
          </div>
          <div className="divide-y divide-[var(--border)]/40">
            {subscribers.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">{s.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {s.subscriptionStatus === "admin_granted" ? "Admin granted" : "Stripe"}
                    {s.grantedPromo && ` · ${s.grantedPromo}`}
                    {s.subscriptionExpiry && ` · Expires ${new Date(s.subscriptionExpiry).toLocaleDateString()}`}
                  </p>
                </div>
                {s.subscriptionStatus === "admin_granted" && (
                  <button onClick={() => revokeGrant(s.id)}
                    className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
