"use client";

// AI search box that sits at the top of /movies. Takes a natural-language
// prompt, extracts filters via /api/movies/ai, and navigates the user to
// /movies with those filters in the URL. Hidden filters (severity caps,
// exclude-genres, exclude-anime, exclude-languages) get surfaced in the URL
// too but collapsed into a single removable "AI filter" pill elsewhere.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function MoviesAiSearch() {
  const { user } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = prompt.trim();
    if (!user) { setError("Sign in to use AI search."); return; }
    if (clean.length < 5) { setError("Describe what you want to find."); return; }
    setError("");
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/movies/ai", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "AI search failed.");
        setLoading(false);
        return;
      }
      if (typeof data.url === "string") {
        router.push(data.url);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-3 rounded-xl border border-[var(--ratist-red)]/30 bg-gradient-to-br from-[var(--ratist-red)]/5 to-transparent">
      <div className="flex items-center gap-2 mb-2">
        <Wand2 className="w-4 h-4 text-[var(--ratist-red)]" />
        <p className="text-sm font-semibold text-white">AI search</p>
        <span className="text-[10px] text-[var(--foreground-muted)]">
          — describe what you want and we&apos;ll set the filters
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Korean thrillers from the 2010s, rated 8+" or "no anime or foreign films"'
          maxLength={500}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
        <button
          type="submit"
          disabled={loading || !user || prompt.trim().length < 5}
          className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {loading ? "Thinking..." : "Find with AI"}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <p className="text-[10px] text-[var(--foreground-muted)]">
            {user
              ? "Free: 20/day · Backstage Pass: 50/day"
              : <>Sign-in required. <Link href="/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link></>}
          </p>
        )}
      </div>
    </form>
  );
}
