// OpenSubtitles REST API v1 client — narrow wrapper for the pieces the
// Watch Companion generator needs (search by TMDB + download one subtitle
// file). The free tier allows a handful of downloads per day per account;
// every call here is wrapped in try/catch so generation never fails just
// because OpenSubtitles had a bad day.
//
// Env vars (all three required to actually fetch subtitles):
//   OPENSUBTITLES_API_KEY  — issued from the OpenSubtitles developer portal
//   OPENSUBTITLES_USERNAME — login (required to mint a download token)
//   OPENSUBTITLES_PASSWORD — login
//
// If any are missing, getSubtitleForTmdb returns null and the caller
// proceeds without subtitles.

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
 * Mints a login token, cached in-process for ~12h. Required for POST
 * /download (which mints the actual download URL). Throws if credentials
 * are missing or the login fails.
 */
async function getAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  const username = process.env.OPENSUBTITLES_USERNAME;
  const password = process.env.OPENSUBTITLES_PASSWORD;
  if (!username || !password) throw new Error("OpenSubtitles credentials missing");

  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`OpenSubtitles login failed (${res.status})`);
  const data = await res.json() as { token?: string };
  if (!data.token) throw new Error("OpenSubtitles login returned no token");
  // OpenSubtitles tokens are valid ~24h; we cache for 12h to be safe.
  cachedToken = { token: data.token, expires: Date.now() + 12 * 60 * 60 * 1000 };
  return data.token;
}

interface SearchHit {
  attributes: {
    feature_details?: { feature_type?: string; title?: string; season_number?: number; episode_number?: number };
    language?: string;
    download_count?: number;
    files?: Array<{ file_id?: number; file_name?: string }>;
  };
}

/**
 * Search OpenSubtitles for English subs matching a TMDB id. For TV we pass
 * both the parent show id and the desired season+episode. Returns the first
 * file_id that looks promising (most downloaded English result), or null
 * when nothing usable comes back.
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

  // Prefer the result with highest download count (most community-vetted).
  // Tie-break on first-returned order.
  const ranked = [...hits].sort((a, b) =>
    (b.attributes.download_count ?? 0) - (a.attributes.download_count ?? 0),
  );
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
  const res = await fetch(`${BASE}/download`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    if (!process.env.OPENSUBTITLES_API_KEY || !process.env.OPENSUBTITLES_USERNAME || !process.env.OPENSUBTITLES_PASSWORD) {
      return null;
    }
    const fileId = await searchForFileId(tmdbId, mediaType, season, episode);
    if (!fileId) return null;
    return await downloadSubtitle(fileId);
  } catch (err) {
    console.error("getSubtitleForTmdb error (proceeding without subs):", err);
    return null;
  }
}
