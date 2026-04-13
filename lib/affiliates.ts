/**
 * Affiliate link configuration and URL builders.
 *
 * All affiliate IDs use NEXT_PUBLIC_ prefix so they work in client components.
 * They're not secrets — they're visible in the generated URLs anyway.
 *
 * When an env-var is empty the helper returns a plain (non-affiliate)
 * fallback URL so the site always works before signing up for any program.
 */

// ─── Streaming provider deep-link templates ────────────────────────────────

interface ProviderAffiliateConfig {
  name: string;
  envKey: string;
  buildUrl: (title: string, tag: string, type: "movie" | "tv") => string;
  fallbackUrl: (title: string, type: "movie" | "tv") => string;
}

const PROVIDER_CONFIGS: Record<number, ProviderAffiliateConfig> = {
  // Netflix (8) — no general affiliate program; link to title search
  8: {
    name: "Netflix",
    envKey: "NEXT_PUBLIC_NETFLIX_AFFILIATE_ID",
    buildUrl: (title) =>
      `https://www.netflix.com/search?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.netflix.com/search?q=${title}`,
  },

  // Amazon Prime Video (9) — Amazon Associates
  9: {
    name: "Amazon Prime Video",
    envKey: "NEXT_PUBLIC_AMAZON_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.amazon.com/s?k=${title}&i=instant-video&tag=${tag}`
        : `https://www.amazon.com/s?k=${title}&i=instant-video`,
    fallbackUrl: (title) =>
      `https://www.amazon.com/s?k=${title}&i=instant-video`,
  },

  // Disney+ (337) — Impact affiliate network
  337: {
    name: "Disney+",
    envKey: "NEXT_PUBLIC_DISNEY_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.disneyplus.com/search/${title}?irclickid=${tag}`
        : `https://www.disneyplus.com/search/${title}`,
    fallbackUrl: (title) =>
      `https://www.disneyplus.com/search/${title}`,
  },

  // Hulu (15) — Impact affiliate network
  15: {
    name: "Hulu",
    envKey: "NEXT_PUBLIC_HULU_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.hulu.com/search?q=${title}&irclickid=${tag}`
        : `https://www.hulu.com/search?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.hulu.com/search?q=${title}`,
  },

  // Max / HBO Max (1899)
  1899: {
    name: "Max",
    envKey: "NEXT_PUBLIC_MAX_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://play.max.com/search?q=${title}&utm_source=affiliate&utm_medium=${tag}`
        : `https://play.max.com/search?q=${title}`,
    fallbackUrl: (title) =>
      `https://play.max.com/search?q=${title}`,
  },

  // Apple TV+ (350) — Apple Services Performance Partners
  350: {
    name: "Apple TV+",
    envKey: "NEXT_PUBLIC_APPLE_AFFILIATE_TOKEN",
    buildUrl: (title, tag, type) =>
      tag
        ? `https://tv.apple.com/search?term=${title}&at=${tag}&ct=ratist&mt=${type === "movie" ? "6" : "4"}`
        : `https://tv.apple.com/search?term=${title}`,
    fallbackUrl: (title) =>
      `https://tv.apple.com/search?term=${title}`,
  },

  // Peacock (386)
  386: {
    name: "Peacock",
    envKey: "NEXT_PUBLIC_PEACOCK_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.peacocktv.com/search?q=${title}&utm_source=affiliate&utm_medium=${tag}`
        : `https://www.peacocktv.com/search?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.peacocktv.com/search?q=${title}`,
  },

  // Paramount+ (2303)
  2303: {
    name: "Paramount+",
    envKey: "NEXT_PUBLIC_PARAMOUNT_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.paramountplus.com/search/?q=${title}&irclickid=${tag}`
        : `https://www.paramountplus.com/search/?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.paramountplus.com/search/?q=${title}`,
  },

  // Starz (43) — CJ Affiliate
  43: {
    name: "Starz",
    envKey: "NEXT_PUBLIC_STARZ_CJ_AID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.starz.com/search?q=${title}&cjevent=${tag}`
        : `https://www.starz.com/search?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.starz.com/search?q=${title}`,
  },

  // Plex (538) — CJ Affiliate
  538: {
    name: "Plex",
    envKey: "NEXT_PUBLIC_PLEX_CJ_AID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.plex.tv/search/?query=${title}&cjevent=${tag}`
        : `https://www.plex.tv/search/?query=${title}`,
    fallbackUrl: (title) =>
      `https://www.plex.tv/search/?query=${title}`,
  },
};

// ─── Rent / Buy providers ───────────────────────────────────────────────────

const RENT_BUY_EXTRAS: Record<number, ProviderAffiliateConfig> = {
  // Google Play Movies (3)
  3: {
    name: "Google Play Movies",
    envKey: "NEXT_PUBLIC_GOOGLE_PLAY_AFFILIATE_ID",
    buildUrl: (title) =>
      `https://play.google.com/store/search?q=${title}&c=movies`,
    fallbackUrl: (title) =>
      `https://play.google.com/store/search?q=${title}&c=movies`,
  },

  // YouTube (192)
  192: {
    name: "YouTube",
    envKey: "NEXT_PUBLIC_YOUTUBE_AFFILIATE_ID",
    buildUrl: (title) =>
      `https://www.youtube.com/results?search_query=${title}+full+movie`,
    fallbackUrl: (title) =>
      `https://www.youtube.com/results?search_query=${title}+full+movie`,
  },

  // Vudu / Fandango at Home (7)
  7: {
    name: "Fandango at Home",
    envKey: "NEXT_PUBLIC_VUDU_AFFILIATE_ID",
    buildUrl: (title, tag) =>
      tag
        ? `https://www.vudu.com/content/movies/search?searchString=${title}&tag=${tag}`
        : `https://www.vudu.com/content/movies/search?searchString=${title}`,
    fallbackUrl: (title) =>
      `https://www.vudu.com/content/movies/search?searchString=${title}`,
  },

  // Microsoft Store (68)
  68: {
    name: "Microsoft Store",
    envKey: "NEXT_PUBLIC_MICROSOFT_AFFILIATE_ID",
    buildUrl: (title) =>
      `https://www.microsoft.com/en-us/search/shop/movies?q=${title}`,
    fallbackUrl: (title) =>
      `https://www.microsoft.com/en-us/search/shop/movies?q=${title}`,
  },
};

const ALL_CONFIGS: Record<number, ProviderAffiliateConfig> = {
  ...PROVIDER_CONFIGS,
  ...RENT_BUY_EXTRAS,
};

// ─── Public API ─────────────────────────────────────────────────────────────

function resolveUrl(
  configs: Record<number, ProviderAffiliateConfig>,
  providerId: number,
  contentTitle: string,
  contentType: "movie" | "tv",
): string {
  const encoded = encodeURIComponent(contentTitle);
  const config = configs[providerId];

  if (!config) {
    return `https://www.justwatch.com/us/search?q=${encoded}`;
  }

  const tag = process.env[config.envKey] ?? "";
  return tag
    ? config.buildUrl(encoded, tag, contentType)
    : config.fallbackUrl(encoded, contentType);
}

/** Build a streaming-provider affiliate link. */
export function getProviderUrl(
  providerId: number,
  contentTitle: string,
  contentType: "movie" | "tv" = "movie",
): string {
  return resolveUrl(ALL_CONFIGS, providerId, contentTitle, contentType);
}

/** Build a rent/buy provider link. */
export function getRentBuyUrl(
  providerId: number,
  contentTitle: string,
  contentType: "movie" | "tv" = "movie",
): string {
  return resolveUrl(ALL_CONFIGS, providerId, contentTitle, contentType);
}

// ─── Fandango ───────────────────────────────────────────────────────────────

/** Build a Fandango ticket link (CJ Affiliate). */
export function getFandangoUrl(movieTitle: string): string {
  const encoded = encodeURIComponent(movieTitle);
  const cjPid = process.env.NEXT_PUBLIC_FANDANGO_CJ_PID ?? "";
  const cjAid = process.env.NEXT_PUBLIC_FANDANGO_CJ_AID ?? "";

  if (cjPid && cjAid) {
    return `https://www.anrdoezrs.net/click-${cjPid}-${cjAid}?url=${encodeURIComponent(`https://www.fandango.com/search?q=${encoded}`)}&sid=ratist`;
  }
  return `https://www.fandango.com/search?q=${encoded}`;
}

// ─── Spotify ────────────────────────────────────────────────────────────────

/** Build a Spotify search link for a soundtrack track. */
export function getSpotifyTrackUrl(trackTitle: string, artist: string): string {
  const q = `${trackTitle} ${artist}`;
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`;
}
