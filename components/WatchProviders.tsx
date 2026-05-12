import Image from "next/image";
import type { TMDBWatchProvider } from "@/lib/tmdb";
import { getProviderUrl, getRentBuyUrl, getTrackerProviderKey } from "@/lib/affiliates";
import AffiliateLink from "./AffiliateLink";
import StreamingWatchToggle from "./StreamingWatchToggle";

interface Props {
  streaming?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
  contentTitle?: string;
  contentType?: "movie" | "tv";
  /** TMDB id of the title these providers belong to. Forwarded to the
   *  click tracker so the admin report can break down "top titles per
   *  provider" — only logged when present. */
  tmdbId?: number;
}

function ProviderBadges({ providers, contentTitle, contentType = "movie", isRent, tmdbId }: { providers: TMDBWatchProvider[]; contentTitle?: string; contentType?: "movie" | "tv"; isRent?: boolean; tmdbId?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => {
        const href = contentTitle
          ? (isRent ? getRentBuyUrl(p.provider_id, contentTitle, contentType) : getProviderUrl(p.provider_id, contentTitle, contentType))
          : undefined;

        const badge = (
          <div
            title={p.provider_name}
            className={`relative w-9 h-9 rounded-lg overflow-hidden border border-[var(--border)] shrink-0 ${href ? "hover:border-[var(--ratist-red)] transition-colors" : ""}`}
          >
            <Image
              src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
              alt={p.provider_name}
              fill
              sizes="36px"
              className="object-cover"
            />
          </div>
        );

        return href ? (
          <AffiliateLink
            key={p.provider_id}
            href={href}
            provider={getTrackerProviderKey(p.provider_id)}
            mediaType={contentType}
            tmdbId={tmdbId}
          >
            {badge}
          </AffiliateLink>
        ) : (
          <div key={p.provider_id}>{badge}</div>
        );
      })}
    </div>
  );
}

export default function WatchProviders({ streaming, rent, contentTitle, contentType = "movie", tmdbId }: Props) {
  const hasStreaming = !!(streaming && streaming.length > 0);
  const hasRent = !!(rent && rent.length > 0);
  // Show the section whenever there's ANY data OR a tmdbId we can
  // attach a streaming-watch alert to. Hiding the whole block when
  // nothing's available used to bury the "notify me when streaming"
  // toggle in cases where TMDB only had rent/buy data — exactly the
  // case the user wants to be alerted about.
  if (!hasStreaming && !hasRent && !tmdbId) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Where to Watch</h3>
      {hasStreaming && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Stream</p>
          <ProviderBadges providers={streaming!} contentTitle={contentTitle} contentType={contentType} tmdbId={tmdbId} />
        </div>
      )}
      {hasRent && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Rent / Buy</p>
          <ProviderBadges providers={rent!} contentTitle={contentTitle} contentType={contentType} isRent tmdbId={tmdbId} />
        </div>
      )}
      {/* Streaming alert — only shown when the title isn't already
         streaming. The toggle component itself self-hides when
         isAlreadyStreaming is true; we still pass it explicitly so
         the SSR markup matches a hydrated client. */}
      {tmdbId && (
        <StreamingWatchToggle
          tmdbId={tmdbId}
          mediaType={contentType}
          isAlreadyStreaming={hasStreaming}
        />
      )}
      <p className="text-[10px] text-[var(--foreground-muted)]/60">
        Streaming availability for US region, via JustWatch.
      </p>
    </div>
  );
}
