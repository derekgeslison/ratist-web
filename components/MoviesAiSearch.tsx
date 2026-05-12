"use client";

// AI search box on /movies. Visually secondary: collapsed disclosure
// with neutral styling so it doesn't compete with the filter bar
// (the primary search path). Open it explicitly when the natural-
// language flow is useful. Same backend as before — POSTs to
// /api/movies/ai, extracts filters, navigates to /movies with the
// URL params set.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function MoviesAiSearch() {
  const { user } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

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
    <section className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wand2 className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />
          <span className="text-sm font-medium text-white">Search with AI</span>
          <span className="text-[10px] text-[var(--foreground-muted)] truncate hidden sm:inline">
            — describe what you want in plain language
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" /> : <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />}
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Korean thrillers from the 2010s, rated 8+" or "no anime or foreign films"'
              maxLength={500}
              className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            <button
              type="submit"
              disabled={loading || !user || prompt.trim().length < 5}
              className="flex items-center justify-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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
      )}
    </section>
  );
}
