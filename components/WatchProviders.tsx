import Image from "next/image";
import type { TMDBWatchProvider } from "@/lib/tmdb";

interface Props {
  streaming?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
}

function ProviderBadges({ providers }: { providers: TMDBWatchProvider[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => (
        <div
          key={p.provider_id}
          title={p.provider_name}
          className="relative w-9 h-9 rounded-lg overflow-hidden border border-[var(--border)] shrink-0"
        >
          <Image
            src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
            alt={p.provider_name}
            fill
            sizes="36px"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

export default function WatchProviders({ streaming, rent }: Props) {
  if (!streaming?.length && !rent?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Where to Watch</h3>
      {streaming && streaming.length > 0 && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Stream</p>
          <ProviderBadges providers={streaming} />
        </div>
      )}
      {rent && rent.length > 0 && (
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">Rent / Buy</p>
          <ProviderBadges providers={rent} />
        </div>
      )}
      <p className="text-[10px] text-[var(--foreground-muted)]/60">
        Streaming availability for US region, via JustWatch.
      </p>
    </div>
  );
}
