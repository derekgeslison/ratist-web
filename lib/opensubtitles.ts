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
  if (!username || !password) {
    // Visible signal so a missed env var setting doesn't manifest as a
    // mysterious anonymous-tier quota cap downstream.
    console.warn("OpenSubtitles: USERNAME/PASSWORD env vars missing — falling back to anonymous downloads (5/day shared bucket).");
    return null;
  }

  try {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      // Surface the body so we can tell credential errors (401) from
      // upstream outages (5xx) from "wrong content type" (4xx). Without
      // this, every login failure silently fell back to anonymous and
      // looked indistinguishable from "USERNAME not set".
      const body = await res.text().catch(() => "");
      console.error(`OpenSubtitles login failed (HTTP ${res.status}, user=${username}): ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { token?: string; user?: { allowed_downloads?: number; level?: string; vip?: boolean } };
    if (!data.token) {
      console.error(`OpenSubtitles login returned 200 but no token (user=${username}). Body: ${JSON.stringify(data).slice(0, 200)}`);
      return null;
    }
    // Log the account's reported plan once per login. If this number is
    // far off the paid plan's daily cap (e.g. shows 20 when the account
    // should be 2000) the wrong user is configured in env vars or the
    // paid plan landed on a different account than the one logging in.
    const plan = data.user?.allowed_downloads ?? "?";
    const level = data.user?.level ?? "?";
    const vip = data.user?.vip === true ? " (VIP)" : "";
    console.log(`OpenSubtitles: authenticated as ${username} — daily cap ${plan}, level ${level}${vip}.`);
    // OpenSubtitles tokens are valid ~24h; we cache for 12h to be safe.
    cachedToken = { token: data.token, expires: Date.now() + 12 * 60 * 60 * 1000 };
    return data.token;
  } catch (err) {
    console.error("OpenSubtitles login threw (proceeding anonymously):", err);
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
 * Discriminated result for getSubtitleForTmdb. Callers that only care about
 * "did we get text or not" can check `result.ok`; callers that need to
 * surface the failure to a user (admin generation UI) read `reason` and
 * `message` for a human-readable summary.
 *
 * `remaining` (when present) is the daily-download quota OpenSubtitles
 * reports back on a successful /download mint. We pass it through so the
 * admin can see live quota usage.
 */
export type SubtitleResult =
  | { ok: true; srt: string; remaining: number | null }
  | { ok: false; reason: SubtitleFailureReason; message: string };

export type SubtitleFailureReason =
  | "no_api_key"        // OPENSUBTITLES_API_KEY env var missing
  | "no_results"        // search returned zero hits
  | "all_filtered"      // hits existed but every one was junk / MT / foreign-only
  | "search_failed"     // /subtitles call returned non-2xx (non-rate-limit)
  | "rate_limited"      // /subtitles or /download returned 429 even after retries
  | "quota_exceeded"    // /download returned 406, OR a body explicitly citing the daily cap
  | "download_failed"   // /download returned a different error status
  | "network_error";    // thrown exception during the call

// OpenSubtitles caps each endpoint at ~5 req/sec per API key. A single
// subtitle fetch hits two endpoints; bursty parallel grounding fetches
// have repeatedly tripped this even on small seasons. fetchWithRetry
// catches the 429 and waits before trying again (Retry-After when the
// server provides one, else exponential backoff). 2 retries is plenty
// for transient per-second throttling — anything more usually indicates
// a real outage that no amount of waiting will solve.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 5000)
      : 500 * Math.pow(2, attempt); // 500ms, then 1000ms
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Unreachable — the loop returns on the last attempt — but TS needs it.
  return fetch(url, init);
}

/**
 * Fetches the raw SRT text for a given file_id. Handles the two-step
 * download (POST /download mints a temporary URL, then we GET that URL
 * to pull the SRT bytes). Returns either the SRT text + remaining quota
 * or a failure reason — quota_exceeded vs other download errors are
 * distinguished so the admin UI can surface "you've hit your daily limit"
 * specifically.
 */
async function downloadSubtitle(fileId: number): Promise<
  | { ok: true; srt: string; remaining: number | null }
  | { ok: false; reason: "quota_exceeded" | "rate_limited" | "download_failed"; message: string }
> {
  const token = await getAuthToken();
  // Only attach Authorization when we have a token. Anonymous downloads
  // depend on the API consumer being configured to allow them; the server
  // still honors Api-Key + User-Agent.
  const extraHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (token) extraHeaders.Authorization = `Bearer ${token}`;
  const res = await fetchWithRetry(`${BASE}/download`, {
    method: "POST",
    headers: { ...headers(), ...extraHeaders },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`OpenSubtitles download mint failed (${res.status}):`, body.slice(0, 200));
    // 406 = "Not Acceptable" → OpenSubtitles' canonical daily-cap signal.
    // 429 after retries = per-second rate limit we couldn't ride out — a
    // distinct condition the admin should distinguish from "your daily
    // 1000 downloads are gone". Body sometimes carries the actual answer
    // ("download more than X per day") when the wrapper doesn't have it.
    const bodyMentionsDaily = /\b(download.*per.*day|daily.*limit|exceeded.*today)\b/i.test(body);
    if (res.status === 406 || bodyMentionsDaily) {
      return {
        ok: false,
        reason: "quota_exceeded",
        message: extractMessage(body) ?? `OpenSubtitles daily download limit reached (HTTP ${res.status}).`,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message: extractMessage(body) ?? "OpenSubtitles per-second rate limit hit (after retries). Try again in a moment.",
      };
    }
    return {
      ok: false,
      reason: "download_failed",
      message: extractMessage(body) ?? `OpenSubtitles /download returned HTTP ${res.status}.`,
    };
  }
  const data = await res.json() as { link?: string; remaining?: number };
  if (!data.link) {
    return { ok: false, reason: "download_failed", message: "OpenSubtitles /download mint returned no link." };
  }

  const srtRes = await fetch(data.link);
  if (!srtRes.ok) {
    return { ok: false, reason: "download_failed", message: `Subtitle CDN returned HTTP ${srtRes.status}.` };
  }
  const remaining = typeof data.remaining === "number" ? data.remaining : null;
  // Surface the running quota in Vercel logs so a slow leak (e.g. a
  // bad backfill burning through downloads) is visible before it
  // exhausts the cap. Logged at info-level only; we don't want to
  // alert on every successful download.
  if (remaining !== null) {
    console.log(`OpenSubtitles: download ok (file=${fileId}), ${remaining} downloads remaining today.`);
  }
  return { ok: true, srt: await srtRes.text(), remaining };
}

// Pull the human-readable `message` field out of a JSON-shaped error body
// when present. Falls back to a trimmed prefix of the raw body otherwise.
function extractMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message.slice(0, 200);
  } catch { /* body wasn't JSON */ }
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

/**
 * High-level: pull the English subtitle text for a target. Always returns
 * a discriminated `SubtitleResult`. Never throws — generation proceeds
 * without subtitles when ok=false; the caller surfaces the reason to the
 * admin UI so quota issues stop being silent.
 */
export async function getSubtitleForTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<SubtitleResult> {
  try {
    if (!process.env.OPENSUBTITLES_API_KEY) {
      return { ok: false, reason: "no_api_key", message: "OPENSUBTITLES_API_KEY env var is not set." };
    }
    const search = await searchForFileIdWithReason(tmdbId, mediaType, season, episode);
    if (!search.ok) return search;
    return await downloadSubtitle(search.fileId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getSubtitleForTmdb error (proceeding without subs):", err);
    return { ok: false, reason: "network_error", message: `OpenSubtitles network error: ${msg}` };
  }
}

/**
 * Wraps searchForFileId so we can distinguish between "no hits at all" and
 * "hits existed but every one was filtered out" (junk / MT / foreign-only)
 * — useful signal because the second one means our filter is too strict
 * for this title, not that OpenSubtitles is broken.
 */
async function searchForFileIdWithReason(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<
  | { ok: true; fileId: number }
  | { ok: false; reason: "no_results" | "all_filtered" | "search_failed" | "rate_limited"; message: string }
> {
  const params = new URLSearchParams({ languages: "en" });
  if (mediaType === "movie") {
    params.set("tmdb_id", String(tmdbId));
  } else {
    params.set("parent_tmdb_id", String(tmdbId));
    if (season) params.set("season_number", String(season));
    if (episode) params.set("episode_number", String(episode));
  }

  const res = await fetchWithRetry(`${BASE}/subtitles?${params.toString()}`, { headers: headers() });
  if (!res.ok) {
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited", message: "OpenSubtitles per-second rate limit hit on search (after retries)." };
    }
    return { ok: false, reason: "search_failed", message: `OpenSubtitles /subtitles returned HTTP ${res.status}.` };
  }
  const data = await res.json() as { data?: SearchHit[] };
  const hits = data.data ?? [];
  if (hits.length === 0) {
    return { ok: false, reason: "no_results", message: "OpenSubtitles has no English subs for this title." };
  }

  const candidates = hits.filter((h) => {
    const a = h.attributes;
    if (a.foreign_parts_only) return false;
    if (a.ai_translated || a.machine_translated) return false;
    if (isJunkRelease(h)) return false;
    return true;
  });
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "all_filtered",
      message: `Found ${hits.length} subs but all were machine-translated, foreign-parts-only, or commentary tracks.`,
    };
  }

  const ranked = [...candidates].sort((a, b) => {
    const trustDelta = Number(!!b.attributes.from_trusted) - Number(!!a.attributes.from_trusted);
    if (trustDelta !== 0) return trustDelta;
    const ratingDelta = (b.attributes.ratings ?? 0) - (a.attributes.ratings ?? 0);
    if (ratingDelta !== 0) return ratingDelta;
    return (b.attributes.download_count ?? 0) - (a.attributes.download_count ?? 0);
  });
  for (const hit of ranked) {
    const fileId = hit.attributes.files?.[0]?.file_id;
    if (fileId) return { ok: true, fileId };
  }
  return { ok: false, reason: "all_filtered", message: "Top-ranked subs had no downloadable file_id." };
}
