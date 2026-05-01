"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

export interface CommunityCollectionCardData {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  mediaType: string;
  coverPath: string | null;
  saveCount: number;
  itemCount: number;
  publishedAt: string | null;
  tags: string[];
  previewPosters: string[];
  curator: {
    id: string;
    name: string;
    firebaseUid: string;
    avatarUrl: string | null;
    isAdmin: boolean;
  };
  isSaved: boolean;
  // Admin-flagged "official" curation. When true the card surfaces the
  // Ratist branding instead of the curator's user name.
  isOfficial?: boolean;
  // Phase 2 enrichments — server may omit when prediction wasn't possible
  // (cold-start user, items without community ratings) or watched data
  // wasn't fetched. Card hides the badge/pill when null.
  matchScore?: number | null;
  watched?: { watched: number; total: number } | null;
  // Phase 3: first non-empty per-item blurb the curator wrote, for the
  // pull-quote preview on the card. Null = no annotations yet.
  sampleBlurb?: { blurb: string; title: string } | null;
}

// Color mapping mirrors the rating-badge palette used elsewhere on the
// site so a "78% match" pill reads with the same green→red anchor as a
// 7.8 Ratist rating elsewhere.
function matchClasses(score: number): string {
  if (score >= 85) return "bg-green-500/15 text-green-300 border-green-500/40";
  if (score >= 70) return "bg-lime-500/15 text-lime-300 border-lime-500/40";
  if (score >= 55) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  if (score >= 40) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  return "bg-red-500/15 text-red-300 border-red-500/40";
}

interface Props {
  collection: CommunityCollectionCardData;
  // Called after a successful save toggle so the parent can update its
  // local state without refetching the whole feed.
  onSavedChange?: (id: string, isSaved: boolean, saveCount: number) => void;
}

export default function CommunityCollectionCard({ collection, onSavedChange }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  // Track local state independently so optimistic updates don't fight
  // a parent that's slow to push the new prop value back.
  const [isSaved, setIsSaved] = useState(collection.isSaved);
  const [saveCount, setSaveCount] = useState(collection.saveCount);

  const href = collection.slug
    ? `/collections/${collection.curator.firebaseUid}/${collection.slug}`
    : `/tools/collections`; // shouldn't happen for public, but fail safe

  async function toggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user || saving) return;
    setSaving(true);
    const wasSaved = isSaved;
    const nextSaved = !wasSaved;
    const nextCount = saveCount + (wasSaved ? -1 : 1);
    setIsSaved(nextSaved);
    setSaveCount(nextCount);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${collection.id}/save`, {
        method: wasSaved ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setIsSaved(wasSaved);
        setSaveCount(saveCount);
      } else {
        onSavedChange?.(collection.id, nextSaved, nextCount);
      }
    } catch {
      setIsSaved(wasSaved);
      setSaveCount(saveCount);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Link
      href={href}
      className="group bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-xl p-3 transition-colors flex flex-col"
    >
      {/* 4-poster preview with match badge overlay */}
      <div className="relative mb-3">
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => {
            const p = collection.previewPosters[i];
            return (
              <div key={i} className="relative w-1/4 aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)]">
                {p ? (
                  <Image src={posterUrl(p, "w154")} alt="" fill sizes="80px" className="object-cover" />
                ) : (
                  <Image src="/placeholder-poster.svg" alt="" fill sizes="80px" className="object-cover opacity-30" />
                )}
              </div>
            );
          })}
        </div>
        {typeof collection.matchScore === "number" && (
          <span
            className={`absolute -top-1.5 -right-1.5 text-[10px] font-bold rounded-full border px-1.5 py-0.5 backdrop-blur-sm ${matchClasses(collection.matchScore)}`}
            title="Predicted match for your taste"
          >
            {collection.matchScore}% match
          </span>
        )}
      </div>

      {/* Title + curator. Official curations attribute to "Ratist" instead
          of surfacing the admin's individual user name. */}
      <h3 className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
        {collection.name}
      </h3>
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--foreground-muted)] mt-0.5">
        {collection.isOfficial ? (
          <span className="flex items-center gap-1 text-[var(--ratist-red)] font-semibold tracking-wide">
            ✦ Curated by The Ratist
          </span>
        ) : (
          <>
            {collection.curator.avatarUrl ? (
              <Image src={collection.curator.avatarUrl} alt="" width={14} height={14} className="rounded-full" />
            ) : null}
            <span className="truncate">{collection.curator.name}</span>
          </>
        )}
      </div>

      {/* Description preview */}
      {collection.description && (
        <p className="text-[11px] text-[var(--foreground-muted)] mt-1.5 line-clamp-2">{collection.description}</p>
      )}

      {/* Pull-quote: first per-item blurb. Differentiates curators who
          left annotated picks from those who just dropped a list. */}
      {collection.sampleBlurb && (
        <blockquote className="mt-2 border-l-2 border-[var(--ratist-red)]/50 pl-2 text-[10px] text-white/70 italic line-clamp-2">
          &ldquo;{collection.sampleBlurb.blurb}&rdquo;
          <span className="block not-italic text-[var(--foreground-muted)] mt-0.5">— on {collection.sampleBlurb.title}</span>
        </blockquote>
      )}

      {/* Tags */}
      {collection.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {collection.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[9px] uppercase tracking-wider bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
          {collection.tags.length > 3 && (
            <span className="text-[9px] text-[var(--foreground-muted)]">+{collection.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: counts + save button */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/50">
        <div className="flex items-center gap-2 text-[10px] text-[var(--foreground-muted)]">
          <span>{collection.itemCount} title{collection.itemCount === 1 ? "" : "s"}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Bookmark className="w-3 h-3" /> {saveCount.toLocaleString()}
          </span>
          {collection.watched && collection.watched.watched > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-green-400" title="Items in this collection you've already seen">
                <Eye className="w-3 h-3" /> {collection.watched.watched}/{collection.watched.total}
              </span>
            </>
          )}
        </div>
        <button
          onClick={toggleSave}
          disabled={saving}
          title={isSaved ? "Bookmarked — click to remove" : "Bookmark this collection so you can find it again"}
          className={`p-1 rounded transition-colors ${
            isSaved ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)]"
          } disabled:opacity-50`}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSaved ? (
            <BookmarkCheck className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </Link>
  );
}
