"use client";

import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Eye, AlertTriangle } from "lucide-react";
import TypeBadge from "./TypeBadge";
import AuthorFlair from "./AuthorFlair";

interface ThreadCardProps {
  slug: string;
  title: string;
  threadType: string;
  hasSpoilers: boolean;
  isPinned: boolean;
  viewCount: number;
  createdAt: string;
  author: {
    firebaseUid: string;
    name: string;
    avatarUrl: string | null;
    _count: { userBadges: number; ratings: number };
  };
  media: { tmdbId: number; mediaType: string; title: string; posterPath: string | null }[];
  tags: { tag: string }[];
  _count: { posts: number };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ThreadCard({ slug, title, threadType, hasSpoilers, isPinned, viewCount, createdAt, author, media, tags, _count }: ThreadCardProps) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 transition-colors hover:border-[var(--foreground-muted)]/30 ${isPinned ? "border-yellow-500/30" : ""}`}>
      {/* Type badge + title */}
      <div className="flex items-start gap-2 mb-2">
        <TypeBadge type={threadType} />
        {hasSpoilers && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />}
        <Link href={`/forum/t/${slug}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors leading-snug flex-1">
          {title}
        </Link>
      </div>

      {/* Linked media posters */}
      {media.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          {media.map((m) => (
            <div key={`${m.mediaType}-${m.tmdbId}`} className="relative w-8 h-12 rounded overflow-hidden shrink-0 border border-[var(--border)]">
              {m.posterPath ? (
                <Image src={`https://image.tmdb.org/t/p/w92${m.posterPath}`} alt={m.title} fill sizes="32px" className="object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">?</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((t) => (
            <Link key={t.tag} href={`/forum?tag=${t.tag}`} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white transition-colors">
              {t.tag}
            </Link>
          ))}
        </div>
      )}

      {/* Author + stats */}
      <div className="flex items-center justify-between gap-3">
        <AuthorFlair
          firebaseUid={author.firebaseUid}
          name={author.name}
          avatarUrl={author.avatarUrl}
          badgeCount={author._count.userBadges}
          ratingCount={author._count.ratings}
        />
        <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)] shrink-0">
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {_count.posts}</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {viewCount}</span>
          <span>{timeAgo(createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
