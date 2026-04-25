"use client";

import { useState } from "react";
import { IMAGE_BASE_URL } from "@/lib/tmdb";
import { getProviderUrl, getRentBuyUrl, getTrackerProviderKey } from "@/lib/affiliates";

export interface ProviderInfo {
  name: string;
  logo: string; // TMDB logo_path e.g. "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
  providerId?: number;
}

interface Props {
  providers: ProviderInfo[];
  size?: number;
  label?: "Stream" | "Rent";
  contentTitle?: string;
  contentType?: "movie" | "tv";
  /** Forwarded to the click tracker so the admin report knows which
   *  title produced this click. Optional — if absent we still record
   *  the click but lose the per-title attribution. */
  tmdbId?: number;
}

export default function ProviderLogos({ providers, size = 20, label, contentTitle, contentType = "movie", tmdbId }: Props) {
  const [tappedIdx, setTappedIdx] = useState<number | null>(null);

  const valid = providers.filter((p) => p.logo);
  if (!valid.length) return null;

  return (
    <div className="flex items-center gap-1 relative">
      {label && (
        <span className={`text-[10px] font-medium mr-0.5 ${label === "Stream" ? "text-green-400" : "text-blue-400"}`}>
          {label}
        </span>
      )}
      {valid.map((p, i) => {
        const href = contentTitle && p.providerId
          ? (label === "Rent"
              ? getRentBuyUrl(p.providerId, contentTitle, contentType)
              : getProviderUrl(p.providerId, contentTitle, contentType))
          : undefined;

        const img = (
          <img
            src={`${IMAGE_BASE_URL}/w92${p.logo}`}
            alt={p.name}
            title={p.name}
            width={size}
            height={size}
            className="rounded-[4px] cursor-pointer"
            onClick={(e) => {
              if (!href) {
                e.preventDefault();
                e.stopPropagation();
              }
              setTappedIdx(tappedIdx === i ? null : i);
            }}
          />
        );

        return (
          <span key={`${p.name}-${i}`} className="relative">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  // Inline track ping — duplicates AffiliateLink's behavior
                  // because this component is already a custom-rendered
                  // anchor with its own onClick (tap-to-show-tooltip).
                  // Wrapping in <AffiliateLink> would conflict with the
                  // event flow; firing the same fetch directly is simpler.
                  try {
                    fetch("/api/affiliate-click", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        provider: p.providerId ? getTrackerProviderKey(p.providerId) : "other",
                        targetUrl: href,
                        mediaType: contentType,
                        tmdbId,
                        referrerPath: typeof window !== "undefined" ? window.location.pathname : null,
                      }),
                      keepalive: true,
                    }).catch(() => {});
                  } catch { /* never block click */ }
                }}
              >
                {img}
              </a>
            ) : (
              img
            )}
            {tappedIdx === i && (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[var(--surface)] border border-[var(--border)] text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-30 pointer-events-none">
                {p.name}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
