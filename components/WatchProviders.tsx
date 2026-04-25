import Image from "next/image";
import type { TMDBWatchProvider } from "@/lib/tmdb";
import { getProviderUrl, getRentBuyUrl, getTrackerProviderKey } from "@/lib/affiliates";
import AffiliateLink from "./AffiliateLink";

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
              src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
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
  if (!streaming?.length && !rent?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Where to Watch</h3>
      {streaming && streaming.length > 0 && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Stream</p>
          <ProviderBadges providers={streaming} contentTitle={contentTitle} contentType={contentType} tmdbId={tmdbId} />
        </div>
      )}
      {rent && rent.length > 0 && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Rent / Buy</p>
          <ProviderBadges providers={rent} contentTitle={contentTitle} contentType={contentType} isRent tmdbId={tmdbId} />
        </div>
      )}
      <p className="text-[10px] text-[var(--foreground-muted)]/60">
        Streaming availability for US region, via JustWatch.
      </p>
    </div>
  );
}
