"use client";

import ShareButton from "@/components/ShareButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com";

interface Props {
  /** Path of the page being shared, beginning with /. */
  path: string;
  /** Path of the OG image endpoint, beginning with /api/og/box-office. */
  ogPath: string;
  /** Text shown in the social share template — also the modal title. */
  shareText: string;
  /** Compact variant for use inside small leaderboard tile headers —
   *  hides the "Share" label, just renders the icon. */
  compact?: boolean;
}

/**
 * Thin wrapper around the project's `ShareButton` for box-office
 * pages. Centralises the SITE_URL → absolute-URL conversion and
 * the (path, ogPath) shape so each page only has to pass three
 * strings instead of repeating the env-var fallback inline.
 */
export function BoxOfficeShare({ path, ogPath, shareText, compact = false }: Props) {
  return (
    <ShareButton
      text={shareText}
      url={`${SITE_URL}${path}`}
      cardImageUrl={`${SITE_URL}${ogPath}`}
      label={compact ? "" : "Share"}
    />
  );
}
