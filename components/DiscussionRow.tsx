"use client";

import Link from "next/link";
import { getPostTypeLabel } from "@/lib/post-type-label";

interface Discussion {
  id: string;
  title: string;
  slug: string;
  threadType: string;
  authorName: string;
  postCount: number;
  createdAt: string;
  linkHref?: string;
}

export default function DiscussionRow({ d }: { d: Discussion }) {
  const typeLabel = getPostTypeLabel(d.threadType);
  const date = new Date(d.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <Link
      href={d.linkHref ?? `/forum/t/${d.slug}`}
      className="flex items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--foreground-muted)]/30 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full shrink-0">
            {typeLabel}
          </span>
          <span className="text-[10px] text-[var(--foreground-muted)] shrink-0">{date}</span>
        </div>
        <p className="text-sm font-semibold text-white truncate">{d.title}</p>
        {(d.authorName !== "The Ratist" || d.postCount > 0) && (
          <p className="text-xs text-[var(--foreground-muted)]">
            {d.authorName !== "The Ratist" && `by ${d.authorName}`}
            {d.authorName !== "The Ratist" && d.postCount > 0 && " · "}
            {d.postCount > 0 && `${d.postCount} posts`}
          </p>
        )}
      </div>
    </Link>
  );
}
