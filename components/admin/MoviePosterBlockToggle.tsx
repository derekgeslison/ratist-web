"use client";

import { useEffect, useState } from "react";
import { Ban, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  tmdbId: number;
  initialPosterBlocked: boolean;
  initialMediaBlocked: boolean;
}

/**
 * Admin-only per-movie content-block controls. Rendered on the movie
 * detail page when the movie is rated NC-17 / NR / unrated. Two
 * independent toggles:
 *   - Poster: flips Movie.posterBlocked → placeholder replaces the poster.
 *   - Media tab: flips Movie.mediaBlocked → Media tab images suppressed
 *     and the backdrop hero swaps to the gradient placeholder.
 * The page itself decides whether to mount this (rating gate lives
 * server-side); this component just renders the buttons and fires
 * the API call.
 */
export default function MoviePosterBlockToggle({
  tmdbId,
  initialPosterBlocked,
  initialMediaBlocked,
}: Props) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [posterBlocked, setPosterBlocked] = useState(initialPosterBlocked);
  const [mediaBlocked, setMediaBlocked] = useState(initialMediaBlocked);
  const [busy, setBusy] = useState<"poster" | "media" | null>(null);
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

  async function flip(which: "poster" | "media") {
    if (!user || busy) return;
    const next = which === "poster" ? !posterBlocked : !mediaBlocked;
    setBusy(which);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const payload: Record<string, unknown> = { mediaType: "movie", tmdbId };
      if (which === "poster") payload.blocked = next;
      else payload.mediaBlocked = next;
      const res = await fetch("/api/admin/poster-block", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (which === "poster") setPosterBlocked(next);
        else setMediaBlocked(next);
        setMessage(`${which === "poster" ? "Poster" : "Media tab"} ${next ? "blocked" : "unblocked"}. Reload to see.`);
      } else {
        setMessage("Action failed");
      }
    } catch {
      setMessage("Action failed");
    }
    setBusy(null);
  }

  if (!isAdmin) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => flip("poster")}
          disabled={!!busy}
          className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
            posterBlocked
              ? "border-green-500/40 text-green-400 hover:bg-green-500/10"
              : "border-red-500/40 text-red-400 hover:bg-red-500/10"
          }`}
          title={posterBlocked ? "Unblock this poster (admin)" : "Block this poster (admin)"}
        >
          {posterBlocked ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
          {posterBlocked ? "Unblock poster" : "Block poster"}
        </button>
        <button
          onClick={() => flip("media")}
          disabled={!!busy}
          className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
            mediaBlocked
              ? "border-green-500/40 text-green-400 hover:bg-green-500/10"
              : "border-red-500/40 text-red-400 hover:bg-red-500/10"
          }`}
          title={mediaBlocked ? "Unblock the Media tab (admin)" : "Block the Media tab (admin)"}
        >
          {mediaBlocked ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
          {mediaBlocked ? "Unblock media" : "Block media"}
        </button>
      </div>
      {message && <span className="text-[10px] text-[var(--foreground-muted)]">{message}</span>}
    </div>
  );
}
