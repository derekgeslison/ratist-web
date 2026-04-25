"use client";

import { ReactNode } from "react";

interface Props {
  href: string;
  /** Stable provider key (lowercased) for grouping in admin reports —
   *  e.g. "netflix", "fandango", "spotify". Must match one of the
   *  provider buckets recognized by /api/affiliate-click; unrecognized
   *  values are silently bucketed as "other" server-side. */
  provider: string;
  /** Optional context — what media the user was clicking from. Drives
   *  the "top titles per provider" breakdown in the admin report. */
  mediaType?: "movie" | "tv";
  tmdbId?: number;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  title?: string;
}

/**
 * Wrapper around a plain anchor that fires a tracking ping on click.
 * Uses fetch with keepalive:true so the request survives the navigation
 * that follows — without keepalive the in-flight POST would be cancelled
 * the moment the new tab opens.
 *
 * Anonymous clicks count: the endpoint accepts unauthenticated requests
 * and records userId=null. We don't attempt to attach an auth token here
 * (the call is fire-and-forget, and an extra getIdToken() round-trip
 * would slow the click). Logged-in users get attributed only when the
 * client happens to have a Firebase ID token cached on document.cookie
 * — for our needs the aggregate is the leverage, not per-user.
 */
export default function AffiliateLink({
  href,
  provider,
  mediaType,
  tmdbId,
  className,
  children,
  ariaLabel,
  title,
}: Props) {
  const onClick = () => {
    try {
      const referrerPath = typeof window !== "undefined" ? window.location.pathname : null;
      fetch("/api/affiliate-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, targetUrl: href, mediaType, tmdbId, referrerPath }),
        keepalive: true,
      }).catch(() => { /* fire-and-forget */ });
    } catch { /* never block the click */ }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </a>
  );
}
