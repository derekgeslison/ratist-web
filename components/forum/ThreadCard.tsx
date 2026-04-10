"use client";

import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Eye, AlertTriangle, Swords } from "lucide-react";
import TypeBadge from "./TypeBadge";
import AuthorFlair from "./AuthorFlair";

interface PollOption {
  id: string;
  label: string;
  _count: { votes: number };
}

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
  opponent?: {
    firebaseUid: string;
    name: string;
    avatarUrl: string | null;
  } | null;
  media: { tmdbId: number; mediaType: string; title: string; posterPath: string | null }[];
  people?: { tmdbId: number; name: string; profilePath: string | null }[];
  tags: { tag: string }[];
  poll?: { options: PollOption[] } | null;
  posts?: { content: string }[];
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

export default function ThreadCard({ slug, title, threadType, hasSpoilers, isPinned, viewCount, createdAt, author, opponent, media, people, tags, poll, posts, _count }: ThreadCardProps) {
  const totalPollVotes = poll?.options?.reduce((s, o) => s + o._count.votes, 0) ?? 0;
  const opContent = posts?.[0]?.content ?? "";
  const contentPreview = opContent.length > 120 ? opContent.slice(0, 120) + "…" : opContent;
  // Comment count = posts - 1 (OP post isn't a comment) -- now using CommentSection, so show actual comment count from _count
  const commentCount = Math.max(0, _count.posts - 1);

  return (
    <Link href={`/forum/t/${slug}`} className={`block bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 transition-colors hover:border-[var(--foreground-muted)]/30 ${isPinned ? "border-yellow-500/30" : ""}`}>
      {/* Type badge + title */}
      <div className="flex items-start gap-2 mb-2">
        <TypeBadge type={threadType} />
        {hasSpoilers && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-white leading-snug">{title}</span>
          {contentPreview && (
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5 line-clamp-1">{contentPreview}</p>
          )}
        </div>
      </div>

      {/* Debate: show debaters */}
      {threadType === "debate" && (
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="relative w-6 h-6 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
              {author.avatarUrl ? (
                <Image src={author.avatarUrl} alt="" fill sizes="24px" className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white bg-[var(--ratist-red)]">{author.name[0]}</div>
              )}
            </div>
            <span className="text-xs text-white">{author.name}</span>
          </div>
          <Swords className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          {opponent ? (
            <div className="flex items-center gap-1.5">
              <div className="relative w-6 h-6 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                {opponent.avatarUrl ? (
                  <Image src={opponent.avatarUrl} alt="" fill sizes="24px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white bg-blue-600">{opponent.name[0]}</div>
                )}
              </div>
              <span className="text-xs text-white">{opponent.name}</span>
            </div>
          ) : (
            <span className="text-xs text-orange-400 italic">Waiting for challenger...</span>
          )}
        </div>
      )}

      {/* Poll preview */}
      {threadType === "poll" && poll?.options && poll.options.length > 0 && (
        <div className="mb-2 space-y-1">
          {poll.options.map((o) => {
            const pct = totalPollVotes > 0 ? Math.round((o._count.votes / totalPollVotes) * 100) : 0;
            return (
              <div key={o.id} className="flex items-center gap-2">
                <div className="flex-1 h-5 bg-[var(--surface-2)] rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 bg-blue-500/30 rounded-full" style={{ width: `${pct}%` }} />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white truncate">{o.label}</span>
                </div>
                <span className="text-[10px] text-[var(--foreground-muted)] w-8 text-right shrink-0">{pct}%</span>
              </div>
            );
          })}
          <p className="text-[10px] text-[var(--foreground-muted)]">{totalPollVotes} vote{totalPollVotes !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Linked media + people as compact chips */}
      {(media.length > 0 || (people && people.length > 0)) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {media.map((m) => (
            <span key={`${m.mediaType}-${m.tmdbId}`} className="inline-flex items-center gap-1.5 bg-[var(--surface-2)] rounded-full pl-1 pr-2.5 py-0.5">
              <div className="relative w-5 h-7 rounded-sm overflow-hidden shrink-0">
                {m.posterPath ? (
                  <Image src={`https://image.tmdb.org/t/p/w92${m.posterPath}`} alt={m.title} fill sizes="20px" className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-[var(--surface)]" />
                )}
              </div>
              <span className="text-[10px] text-[var(--foreground-muted)] truncate max-w-[100px]">{m.title}</span>
            </span>
          ))}
          {people?.map((p) => (
            <span key={p.tmdbId} className="inline-flex items-center gap-1 bg-[var(--surface-2)] rounded-full pl-0.5 pr-2 py-0.5">
              <div className="relative w-5 h-5 rounded-full overflow-hidden shrink-0">
                {p.profilePath ? (
                  <Image src={`https://image.tmdb.org/t/p/w45${p.profilePath}`} alt={p.name} fill sizes="20px" className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-[var(--surface)] flex items-center justify-center text-[7px] font-bold text-white">{p.name[0]}</div>
                )}
              </div>
              <span className="text-[10px] text-[var(--foreground-muted)]">{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((t) => (
            <span key={t.tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)]">
              {t.tag}
            </span>
          ))}
        </div>
      )}

      {/* Author + stats (skip for debate since we already show debaters) */}
      <div className="flex items-center justify-between gap-3">
        {threadType !== "debate" && (
          <AuthorFlair
            firebaseUid={author.firebaseUid}
            name={author.name}
            avatarUrl={author.avatarUrl}
            badgeCount={author._count.userBadges}
            ratingCount={author._count.ratings}
          />
        )}
        <div className={`flex items-center gap-3 text-xs text-[var(--foreground-muted)] shrink-0 ${threadType === "debate" ? "ml-auto" : ""}`}>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {commentCount}</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {viewCount}</span>
          <span>{timeAgo(createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
