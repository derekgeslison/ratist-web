"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Plus, MonitorPlay, Eye, EyeOff, Film, Tv, MessageSquare } from "lucide-react";

interface CompanionRow {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  status: "draft" | "published";
  seasonsGenerated: number[];
  lastGeneratedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  _count: { characters: number; relationships: number; timeline: number; glossary: number; suggestions: number };
}

export default function CompanionsListPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CompanionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/watch-companion", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Access denied or request failed.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setRows(data.companions ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MonitorPlay className="w-5 h-5 text-[var(--ratist-red)]" />
          <h2 className="text-lg font-semibold text-white">Watch Companions</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/watch-companions/suggestions"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-white rounded-lg text-sm font-semibold hover:border-[var(--ratist-red)] transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> Suggestions
          </Link>
          <Link
            href="/admin/watch-companions/new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Generate new
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <MonitorPlay className="w-8 h-8 text-[var(--foreground-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--foreground-muted)] mb-4">No companions yet.</p>
          <Link
            href="/admin/watch-companions/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Generate your first companion
          </Link>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Seasons</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Content</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""}`}>
                  <td className="px-5 py-3">
                    <Link href={`/admin/watch-companions/${row.id}`} className="text-white hover:text-[var(--ratist-red)] transition-colors font-medium">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                      {row.mediaType === "tv" ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                      {row.mediaType === "tv" ? "TV" : "Movie"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--foreground-muted)]">
                    {row.mediaType === "tv"
                      ? row.seasonsGenerated.length > 0
                        ? `S${row.seasonsGenerated.join(", S")}`
                        : "—"
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--foreground-muted)]">
                    {row._count.characters} char · {row._count.relationships} rel · {row._count.timeline} events · {row._count.glossary} terms
                    {row._count.suggestions > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ratist-red)] text-white">
                        {row._count.suggestions} pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "published" ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-green-500/50 text-green-400 bg-green-500/10">
                        <Eye className="w-3 h-3" /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
                        <EyeOff className="w-3 h-3" /> Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--foreground-muted)]">
                    {new Date(row.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
