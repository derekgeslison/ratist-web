"use client";

import { useEffect, useState } from "react";
import { Ban, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  tmdbId: number;
  initialBlocked: boolean;
}

/**
 * Admin-only per-movie poster block toggle. Rendered on the movie
 * detail page when the movie is rated NC-17 — admins can flip
 * posterBlocked from the page where they're seeing the offending
 * poster. The page itself decides whether to mount this (NC-17 gate
 * lives on the server side); this component just renders the button
 * and handles the API call.
 */
export default function MoviePosterBlockToggle({ tmdbId, initialBlocked }: Props) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setIsAdmin(d.isAdmin === true))
        .catch(() => {}),
    );
  }, [user]);

  async function toggle() {
    if (!user || busy) return;
    const next = !blocked;
    setBusy(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/poster-block", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "movie", tmdbId, blocked: next }),
      });
      if (res.ok) {
        setBlocked(next);
        setMessage(next ? "Blocked. Reload to see the placeholder." : "Unblocked. Reload to see the poster.");
      } else {
        setMessage("Action failed");
      }
    } catch {
      setMessage("Action failed");
    }
    setBusy(false);
  }

  if (!isAdmin) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
          blocked
            ? "border-green-500/40 text-green-400 hover:bg-green-500/10"
            : "border-red-500/40 text-red-400 hover:bg-red-500/10"
        }`}
        title={blocked ? "Unblock this poster (admin)" : "Block this poster (admin)"}
      >
        {blocked ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
        {blocked ? "Unblock poster" : "Block poster"}
      </button>
      {message && <span className="text-[10px] text-[var(--foreground-muted)]">{message}</span>}
    </div>
  );
}
