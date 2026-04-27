"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Ban } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Block {
  id: string;
  createdAt: string;
  blocked: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

/**
 * Settings → Privacy section: list of blocked users with an unblock
 * action. Self-contained — fetches its own data so the parent
 * settings page doesn't need to know about block state.
 */
export default function BlockedUsersSection() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/users/me/blocks", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setBlocks(data.blocks ?? []);
      } finally {
        setLoaded(true);
      }
    })();
  }, [user]);

  async function handleUnblock(firebaseUid: string, blockId: string) {
    if (!user || busy) return;
    setBusy(blockId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/users/${firebaseUid}/block`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } finally {
      setBusy(null);
    }
  }

  if (!user) return null;

  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-1">Blocked users</h2>
      <p className="text-xs text-[var(--foreground-muted)] mb-4">
        Blocked users can&rsquo;t follow you, see your content, or be seen by you.
      </p>
      {!loaded ? (
        <p className="text-sm text-[var(--foreground-muted)]">Loading…</p>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">You haven&rsquo;t blocked anyone.</p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b) => (
            <div key={b.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <Link href={`/profile/${b.blocked.firebaseUid}`} className="relative w-9 h-9 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                {b.blocked.avatarUrl ? (
                  <Image src={b.blocked.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-[var(--foreground-muted)]">
                    {b.blocked.name[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${b.blocked.firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors truncate block">
                  {b.blocked.name}
                </Link>
                <p className="text-[10px] text-[var(--foreground-muted)]">
                  Blocked {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <button
                onClick={() => handleUnblock(b.blocked.firebaseUid, b.id)}
                disabled={busy === b.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                {busy === b.id ? "…" : "Unblock"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
