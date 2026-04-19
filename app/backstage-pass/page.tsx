"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Ticket, Check, X, Star, BarChart3, MonitorPlay, Palette, Shield, Sparkles } from "lucide-react";

const FEATURES = [
  { name: "Rate & review movies and TV shows", free: true, pass: true },
  { name: "Personal watchlists & rankings", free: true, pass: true },
  { name: "Community features (Hot Takes, Recast, Pitches, etc.)", free: true, pass: true },
  { name: "For You personalized recommendations", free: true, pass: true },
  { name: "Cine-Q daily trivia", free: true, pass: true },
  { name: "Cinephile tools (What Should I Watch?, Shared Cast & Crew, The Matchup, and more)", free: true, pass: true },
  { name: "Join Screening Room sessions", free: true, pass: true },
  { name: "Host Screening Room sessions", free: false, pass: true, icon: MonitorPlay, href: "/backstage-pass/screening-room" },
  { name: "Movie Club", free: false, pass: true, icon: Star, href: "/backstage-pass/movie-club" },
  { name: "My Analytics (detailed viewing stats)", free: false, pass: true, icon: BarChart3, href: "/backstage-pass/analytics" },
  { name: "Collections (curated recommendations)", free: false, pass: true, icon: Sparkles, href: "/backstage-pass/collections" },
  { name: "Critics Mode (250+ reviews required)", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Live Review feature", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Custom profile themes & colors", free: false, pass: true, icon: Palette, href: "/backstage-pass/custom-themes" },
  { name: "Ad-free experience", free: false, pass: true, icon: Shield },
];

export default function BackstagePassPage() {
  const { user } = useAuth();
  const { hasPass, status, expiry, loading } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [checkingOut, setCheckingOut] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageLoading, setManageLoading] = useState(false);

  async function handleCheckout() {
    if (!user) return;
    setCheckingOut(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/subscription/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan }),
    });
    if (res.ok) {
      const { url } = await res.json();
      if (url) window.location.href = url;
    }
    setCheckingOut(false);
  }

  async function handleManage() {
    if (!user || manageLoading) return;
    setManageLoading(true);
    setManageError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setManageError(data.error ?? "Couldn't open the billing portal. Please try again later.");
        setManageLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setManageError("The billing portal didn't return a URL.");
    } catch {
      setManageError("Network error — please try again.");
    }
    setManageLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 mb-4">
          <Ticket className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-amber-400 mb-3">Backstage Pass</h1>
        <p className="text-lg text-[var(--foreground-muted)] max-w-xl mx-auto">
          Unlock premium tools, host screening rooms, customize your profile, and enjoy The Ratist ad-free.
        </p>
      </div>

      {/* Already subscribed */}
      {hasPass && !loading && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-8 text-center">
          <p className="text-lg font-semibold text-emerald-400 mb-2">You have the Backstage Pass!</p>
          {status === "admin_granted" ? (
            <>
              <p className="text-sm text-[var(--foreground-muted)]">
                Admin-granted Backstage Pass — managed by Ratist staff.
                {expiry && (
                  <> Expires{" "}
                    <span className="text-white">
                      {new Date(expiry).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                    .
                  </>
                )}
                {!expiry && " No expiration."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">Enjoy all premium features.</p>
              <button
                onClick={handleManage}
                disabled={manageLoading}
                className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
              >
                {manageLoading ? "Opening..." : "Manage Subscription"}
              </button>
              {manageError && <p className="text-xs text-red-400 mt-2">{manageError}</p>}
            </>
          )}
        </div>
      )}

      {/* Pricing toggle — shown for non-subscribers, and for admin-granted users
          whose free period is ending soon so they can subscribe without downtime */}
      {(() => {
        const expiryDate = expiry ? new Date(expiry) : null;
        const expiryInFuture = expiryDate && expiryDate.getTime() > Date.now();
        const showUpgrade = hasPass && status === "admin_granted" && expiryInFuture;
        if (loading) return null;
        if (!(!hasPass || showUpgrade)) return null;
        return (
          <>
            {showUpgrade && expiryDate && (
              <p className="text-center text-sm text-[var(--foreground-muted)] mb-4">
                Subscribe now so you don&apos;t lose access — billing will start on{" "}
                <span className="text-white font-semibold">
                  {expiryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </span>{" "}
                when your free period ends.
              </p>
            )}
            <div className="flex justify-center gap-3 mb-8">
              <button
                onClick={() => setSelectedPlan("monthly")}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  selectedPlan === "monthly" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                $3.99 / month
              </button>
              <button
                onClick={() => setSelectedPlan("annual")}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-colors relative ${
                  selectedPlan === "annual" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                $39.99 / year
                <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Save 17%</span>
              </button>
            </div>

            <div className="text-center mb-8">
              {user ? (
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {checkingOut
                    ? "Redirecting to checkout..."
                    : showUpgrade
                      ? `Subscribe — ${selectedPlan === "annual" ? "$39.99/year" : "$3.99/month"} after free period`
                      : `Get Backstage Pass — ${selectedPlan === "annual" ? "$39.99/year" : "$3.99/month"}`}
                </button>
              ) : (
                <SignInLink className="inline-block px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors">
                  Sign in to subscribe
                </SignInLink>
              )}
            </div>
          </>
        );
      })()}

      {/* Feature comparison table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px] border-b border-[var(--border)] px-5 py-3">
          <span className="text-sm font-semibold text-white">Feature</span>
          <span className="text-sm font-semibold text-[var(--foreground-muted)] text-center">Free</span>
          <span className="text-sm font-semibold text-[var(--ratist-red)] text-center">Backstage</span>
        </div>
        {FEATURES.map((f, i) => {
          const row = (
            <div key={i} className={`grid grid-cols-[1fr_80px_80px] px-5 py-3 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""} ${"href" in f && f.href ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""}`}>
              <span className={`text-sm text-white ${"href" in f && f.href ? "hover:text-amber-400 transition-colors" : ""}`}>
                {f.name} {"href" in f && f.href && <span className="text-[10px] text-[var(--foreground-muted)]">→</span>}
              </span>
              <div className="flex justify-center">
                {f.free ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-[var(--foreground-muted)] opacity-30" />}
              </div>
              <div className="flex justify-center">
                <Check className="w-4 h-4 text-[var(--ratist-red)]" />
              </div>
            </div>
          );
          return "href" in f && f.href ? <Link key={i} href={f.href}>{row}</Link> : row;
        })}
      </div>

      {/* Success/cancel messages from Stripe redirect */}
      {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("success") === "1" && (
        <div className="mt-8 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center text-emerald-400">
          Welcome to the Backstage Pass! Your premium features are now active.
        </div>
      )}
    </div>
  );
}
