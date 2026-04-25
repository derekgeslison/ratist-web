"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SignInLink from "@/components/SignInLink";

// Follow toggle for an actively-airing companion. Mounts on a season
// that's in airing status; on click POST/DELETE /api/watch-companion/[id]
// /follow. Unauthenticated viewers see a sign-in prompt instead.
//
// Why a client component: follow state is per-user and not known by the
// public companion page server render — fetching it on mount keeps the
// SSR identical for everyone (no auth check on the SSR path) while still
// reflecting the right state for signed-in users.

export default function FollowCompanionButton({ companionId }: { companionId: string }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFollowing(null);
      return;
    }
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/watch-companion/${companionId}/follow`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { following?: boolean };
        if (!cancelled) setFollowing(!!json.following);
      } catch { /* leave null — button shows neutral state */ }
    })();
    return () => { cancelled = true; };
  }, [companionId, user]);

  if (!user) {
    return (
      <SignInLink className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white border border-[var(--border)] rounded-full hover:border-[var(--ratist-red)] hover:text-[var(--ratist-red)] transition-colors">
        <Bell className="w-3.5 h-3.5" />
        Sign in to follow
      </SignInLink>
    );
  }

  const onClick = async () => {
    if (busy || !user) return;
    setBusy(true);
    const next = !(following ?? false);
    // Optimistic flip — revert on error.
    setFollowing(next);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watch-companion/${companionId}/follow`, {
        method: next ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setFollowing(!next);
      }
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  };

  const isFollowing = !!following;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors disabled:opacity-60 ${
        isFollowing
          ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/40 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20"
          : "border-[var(--border)] text-white hover:border-[var(--ratist-red)] hover:text-[var(--ratist-red)]"
      }`}
      aria-pressed={isFollowing}
    >
      {isFollowing ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      {isFollowing ? "Following" : "Follow for new episodes"}
    </button>
  );
}
