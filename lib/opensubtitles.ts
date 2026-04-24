// OpenSubtitles REST API v1 client — narrow wrapper for the pieces the
// Watch Companion generator needs (search by TMDB + download one subtitle
// file). The free tier allows a handful of downloads per day per API
// consumer; every call here is wrapped in try/catch so generation never
// fails just because OpenSubtitles had a bad day.
//
// Env vars:
//   OPENSUBTITLES_API_KEY  (required) — issued from the OpenSubtitles
//                          developer portal
//   OPENSUBTITLES_USERNAME (optional) — only needed if your API consumer
//                          is NOT configured for anonymous downloads
//   OPENSUBTITLES_PASSWORD (optional) — same
//
// When username + password are present we mint a Bearer token for the
// /download call. When they're absent we skip login entirely and rely on
// the API consumer's "allow anonymous downloads" setting. Without the
// API key the helper returns null and generation proceeds without subs.

const BASE = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "TheRatist v1";

function headers(extra?: Record<string, string>): HeadersInit {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) throw new Error("OPENSUBTITLES_API_KEY not set");
  return {
    "Api-Key": apiKey,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...(extra ?? {}),
  };
}

let cachedToken: { token: string; expires: number } | null = null;

/**
 * Mints a login token, cached in-process for ~12h. Returns null when no
 * credentials are configured (the API consumer is using anonymous download
 * mode). Returns null on login failure too — the download call can still
 * succeed anonymously if the consumer allows it.
 */
async function getAuthToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  const username = process.env.OPENSUBTITLES_USERNAME;
  const password = process.env.OPENSUBTITLES_PASSWORD;
  if (!username || !password) return null;

  try {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    if (!data.token) return null;
    // OpenSubtitles tokens are valid ~24h; we cache for 12h to be safe.
    cachedToken = { token: data.token, expires: Date.now() + 12 * 60 * 60 * 1000 };
    return data.token;
  } catch {
    return null;
  }
}

interface SearchHit {
  attributes: {
    feature_details?: { feature_type?: string; title?: string; season_number?: number; episode_number?: number };
    language?: string;
    download_count?: number;
    ratings?: number;
    votes?: number;
    from_trusted?: boolean;
    hearing_impaired?: boolean;
    foreign_parts_only?: boolean;
    ai_translated?: boolean;
    machine_translated?: boolean;
    release?: string;
    comments?: string;
    files?: Array<{ file_id?: number; file_name?: string }>;
  };
}

// Release filename / uploader comment patterns that tell us the sub file is
// not going to help companion generation. Catches commentary tracks,
// karaoke/bonus material, and similar noise.
const JUNK_PATTERNS = /\b(commentary|director'?s comment|behind.?the.?scenes|making.?of|deleted scene|bonus|extra|featurette|karaoke|sdh signs only)\b/i;

function isJunkRelease(hit: SearchHit): boolean {
  const joined = `${hit.attributes.release ?? ""} ${hit.attributes.comments ?? ""}`;
  return JUNK_PATTERNS.test(joined);
}

/**
 * Search OpenSubtitles for English subs matching a TMDB id. For TV we pass
 * both the parent show id and the desired season+episode.
 *
 * Filtering (applied in order):
 *   - Foreign-parts-only subs (e.g. just the elvish in LOTR) — useless for
 *     dialogue anchoring, dropped.
 *   - Machine-translated / AI-translated — noisy, dropped.
 *   - Commentary / behind-the-scenes / bonus-material releases — not
 *     dialogue, dropped.
 *
 * Ranking (applied in order):
 *   1. Trusted uploaders first — OpenSubtitles flags known-good accounts.
 *   2. Higher user ratings (0–10 stars) — community quality signal.
 *   3. Higher download count — tiebreaker, proxy for "most-picked".
 *
 * Returns the first usable file_id from the winning sub, or null if
 * everything was filtered out / there were no matches at all.
 */
async function searchForFileId(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<number | null> {
  const params = new URLSearchParams({ languages: "en" });
  if (mediaType === "movie") {
    params.set("tmdb_id", String(tmdbId));
  } else {
    // Movie tmdb_id for TV show = parent show id; filter by season/episode.
    params.set("parent_tmdb_id", String(tmdbId));
    if (season) params.set("season_number", String(season));
    if (episode) params.set("episode_number", String(episode));
  }

  const res = await fetch(`${BASE}/subtitles?${params.toString()}`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json() as { data?: SearchHit[] };
  const hits = data.data ?? [];
  if (hits.length === 0) return null;

  const candidates = hits.filter((h) => {
    const a = h.attributes;
    if (a.foreign_parts_only) return false;
    if (a.ai_translated || a.machine_translated) return false;
    if (isJunkRelease(h)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    // Trusted uploaders outrank everyone — hard bucket sort on this flag.
    const trustDelta = Number(!!b.attributes.from_trusted) - Number(!!a.attributes.from_trusted);
    if (trustDelta !== 0) return trustDelta;
    // Then user rating (0–10). Missing rating counts as 0.
    const ratingDelta = (b.attributes.ratings ?? 0) - (a.attributes.ratings ?? 0);
    if (ratingDelta !== 0) return ratingDelta;
    // Finally, download count as a popularity tiebreaker.
    return (b.attributes.download_count ?? 0) - (a.attributes.download_count ?? 0);
  });
  for (const hit of ranked) {
    const fileId = hit.attributes.files?.[0]?.file_id;
    if (fileId) return fileId;
  }
  return null;
}

/**
 * Fetches the raw SRT text for a given file_id. Handles the two-step
 * download (POST /download mints a temporary URL, then we GET that URL
 * to pull the SRT bytes). Returns null on any failure — including
 * quota-exceeded responses.
 */
async function downloadSubtitle(fileId: number): Promise<string | null> {
  const token = await getAuthToken();
  // Only attach Authorization when we have a token. Anonymous downloads
  // depend on the API consumer being configured to allow them; the server
  // still honors Api-Key + User-Agent.
  const extraHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (token) extraHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/download`, {
    method: "POST",
    headers: { ...headers(), ...extraHeaders },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    console.error(`OpenSubtitles download mint failed (${res.status}):`, msg.slice(0, 200));
    return null;
  }
  const data = await res.json() as { link?: string; remaining?: number };
  if (!data.link) return null;

  const srtRes = await fetch(data.link);
  if (!srtRes.ok) return null;
  return await srtRes.text();
}

/**
 * High-level: pull the English subtitle text for a target. Returns null when
 * env vars are missing, when OpenSubtitles has no results, or when quota is
 * exhausted. Never throws — generation proceeds without subtitles if this
 * returns null.
 */
export async function getSubtitleForTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<string | null> {
  try {
    // Only the API key is strictly required. Credentials are optional and
    // only used when the API consumer doesn't allow anonymous downloads.
    if (!process.env.OPENSUBTITLES_API_KEY) return null;
    const fileId = await searchForFileId(tmdbId, mediaType, season, episode);
    if (!fileId) return null;
    return await downloadSubtitle(fileId);
  } catch (err) {
    console.error("getSubtitleForTmdb error (proceeding without subs):", err);
    return null;
  }
}
