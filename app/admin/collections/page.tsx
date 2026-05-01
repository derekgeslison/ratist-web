"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Plus, Loader2, Eye, Bookmark } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface OfficialCollection {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  visibility: string;
  publishedAt: string | null;
  itemCount: number;
  saveCount: number;
  previewPosters: string[];
  authoredBy: string | null;
}

export default function AdminCollectionsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OfficialCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/collections", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setRows(data.collections ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-[var(--ratist-red)]" />
            <h1 className="text-xl font-bold text-white">Ratist-curated collections</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Official collections published under the Ratist brand. They surface on the Featured tab and don&apos;t show the admin&apos;s individual name.
          </p>
        </div>
        <Link
          href="/tools/collections/new?official=true"
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-4 py-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Ratist collection
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--foreground-muted)] border border-dashed border-[var(--border)] rounded-lg">
          No official collections yet. Build one and check the &quot;Publish as Ratist&quot; box on the Save form.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <div className="flex gap-1 shrink-0">
                {Array.from({ length: 4 }).map((_, i) => {
                  const p = c.previewPosters[i];
                  return (
                    <div key={i} className="relative w-8 aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)]">
                      {p && <Image src={posterUrl(p, "w92")} alt="" fill sizes="32px" className="object-cover" />}
                    </div>
                  );
                })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">{c.name}</h3>
                  <span className={`text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5 border ${
                    c.visibility === "public"
                      ? "bg-green-500/15 text-green-300 border-green-500/40"
                      : "bg-[var(--surface-2)] text-[var(--foreground-muted)] border-[var(--border)]"
                  }`}>
                    {c.visibility === "public" ? "Public" : "Draft"}
                  </span>
                </div>
                {c.description && <p className="text-xs text-[var(--foreground-muted)] mt-1 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--foreground-muted)]">
                  <span>{c.itemCount} title{c.itemCount === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" /> {c.saveCount}</span>
                  {c.authoredBy && <span>· by {c.authoredBy}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.visibility === "public" && c.slug && (
                  <Link
                    href={`/collections/${user?.uid}/${c.slug}`}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1 transition-colors"
                  >
                    <Eye className="w-3 h-3" /> View
                  </Link>
                )}
                {/* Manage routes to the edit form directly — the
                    /tools/collections/custom/[id] page is now a
                    private-only owner view that redirects published
                    collections away, so admins need the edit URL. */}
                <Link
                  href={`/tools/collections/custom/${c.id}/edit`}
                  className="text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1 transition-colors"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
