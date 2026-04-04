"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, RotateCcw, Sparkles, Ban } from "lucide-react";

export default function AccountStatusBanner() {
  const { accountStatus, signOut, restoreAccount, startFresh } = useAuth();
  const [acting, setActing] = useState(false);

  if (!accountStatus) return null;

  async function handleRestore() {
    setActing(true);
    await restoreAccount();
    setActing(false);
  }

  async function handleFresh() {
    if (!confirm("This will permanently delete all your old data (ratings, watchlists, seen movies, etc.) and create a fresh account. This cannot be undone. Continue?")) return;
    setActing(true);
    await startFresh();
    setActing(false);
  }

  if (accountStatus.type === "banned") {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-md w-full text-center">
          <Ban className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Account Suspended</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">{accountStatus.message}</p>
          {accountStatus.banReason && (
            <p className="text-xs text-[var(--foreground-muted)] mb-4 bg-[var(--surface-2)] rounded-lg p-3">
              Reason: {accountStatus.banReason}
            </p>
          )}
          <button
            onClick={signOut}
            className="px-6 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg text-sm hover:border-[var(--ratist-red)] transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Deleted account — offer restore or fresh start
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-md w-full text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Account Pending Deletion</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">{accountStatus.message}</p>

        <div className="space-y-3">
          <button
            onClick={handleRestore}
            disabled={acting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {acting ? "Restoring..." : "Restore My Account"}
          </button>
          <p className="text-xs text-[var(--foreground-muted)]">Get back all your ratings, watchlists, and data.</p>

          <div className="border-t border-[var(--border)] my-3" />

          <button
            onClick={handleFresh}
            disabled={acting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg text-sm font-semibold hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {acting ? "Setting up..." : "Start Fresh"}
          </button>
          <p className="text-xs text-[var(--foreground-muted)]">Permanently delete old data and create a new profile.</p>

          <div className="border-t border-[var(--border)] my-3" />

          <button
            onClick={signOut}
            className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
