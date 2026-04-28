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
}

/**
 * Thin wrapper around the project's `ShareButton` for box-office
 * pages. Centralises the SITE_URL → absolute-URL conversion and
 * the (path, ogPath) shape so each page only has to pass three
 * strings instead of repeating the env-var fallback inline.
 *
 * Use the standard ShareButton (X, Facebook, Copy, Download OG,
 * Preview) per project UX rule — not a one-liner Share2 icon.
 */
export function BoxOfficeShare({ path, ogPath, shareText }: Props) {
  return (
    <ShareButton
      text={shareText}
      url={`${SITE_URL}${path}`}
      cardImageUrl={`${SITE_URL}${ogPath}`}
    />
  );
}
