// Takes a natural-language prompt and returns a /movies URL with filters
// applied. Leverages the same extractRecommendationFilters pipeline as the
// /tools/recommend flow so behavior stays consistent, then maps the output
// onto the /movies page's URL param conventions.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/auth-helpers";
import { extractRecommendationFilters, type Mood } from "@/lib/ai/recommend-filters";
import { expandMoods } from "@/lib/ai/mood-expand";
import { checkAiRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { getGenres, getShowGenres, STREAMING_PROVIDERS } from "@/lib/tmdb";
import { resolveKeywordsFull } from "@/lib/tmdb-keywords";
import { resolveCastFull } from "@/lib/tmdb-cast";

// Movie-genre ID → TV-genre ID(s) mapping. Same table /movies uses internally.
const MOVIE_TO_TV_GENRE_ID: Record<number, number[]> = {
  28: [10759],    // Action → Action & Adventure
  12: [10759],    // Adventure → Action & Adventure
  878: [10765],   // Science Fiction → Sci-Fi & Fantasy
  14: [10765],    // Fantasy → Sci-Fi & Fantasy
  10752: [10768], // War → War & Politics
};
const MOVIE_ONLY_GENRE_IDS = new Set([36, 27, 10402, 10749, 53, 10770]); // History, Horror, Music, Romance, Thriller, TV Movie

// Translate movie-genre IDs to TV-genre IDs. Movie-only genres drop because
// they have no TV equivalent (scary/romantic prompts rely on the mood
// expansion on the extraction side to add Mystery/Drama/etc.).
function translateGenreIdsForTv(movieIds: number[]): number[] {
  const out = new Set<number>();
  for (const id of movieIds) {
    if (MOVIE_TO_TV_GENRE_ID[id]) for (const m of MOVIE_TO_TV_GENRE_ID[id]) out.add(m);
    else if (!MOVIE_ONLY_GENRE_IDS.has(id)) out.add(id);
  }
  return [...out];
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to use AI search" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 5) {
    return NextResponse.json({ error: "Describe what you want to find in a few words" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return NextResponse.json({ error: "Prompt is too long (max 500 characters)" }, { status: 400 });
  }

  const rateLimitError = await checkAiRateLimit(user, "movies_search", { freeDaily: 20, paidDaily: 50 });
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  try {
    const raw = await extractRecommendationFilters(prompt);
    // Mood expansion — added genres surface as visible filters; added excludes
    // go into the AI pill. User asked for moods to apply as real filters
    // rather than hidden state.
    const expanded = expandMoods(raw.moods as Mood[], raw.genres, raw.excludeGenres);
    const genreNames = expanded.genres;
    const excludeGenreNames = expanded.excludeGenres;

    // Resolve genre names → TMDB IDs (/movies URL uses IDs, not names).
    // For TV media type, translate movie IDs to TV IDs so the filter bar
    // highlights the right chips and TMDB discover/tv receives the right
    // genres. Movie-only genres (Horror, Romance, Thriller, Music, History,
    // TV Movie) drop on TV — mood expansion on the extraction side adds
    // compensating genres (e.g. "scary" → Mystery + Sci-Fi).
    const genreData = await getGenres();
    const nameToId = new Map(genreData.genres.map((g) => [g.name, g.id]));
    const rawGenreIds = genreNames.map((n) => nameToId.get(n)).filter((id): id is number => id != null);
    const rawExcludeGenreIds = excludeGenreNames.map((n) => nameToId.get(n)).filter((id): id is number => id != null);
    // If mediaType is TV, pull the TV-genre list to look up any names that
    // only exist as TV genres (e.g. "Sci-Fi & Fantasy", "Action & Adventure",
    // "War & Politics", "Kids", "Reality", "Soap", "Talk", "News").
    let genreIds: number[];
    let excludeGenreIds: number[];
    if (raw.mediaType === "tv") {
      const tvGenreData = await getShowGenres();
      const tvNameToId = new Map(tvGenreData.genres.map((g) => [g.name, g.id]));
      // First, translate any movie IDs we already resolved. Then backfill
      // anything that only exists as a TV genre name directly.
      const translated = translateGenreIdsForTv(rawGenreIds);
      const translatedExclude = translateGenreIdsForTv(rawExcludeGenreIds);
      // Also look up names that didn't resolve as movie genres (TV-only).
      const tvOnlyIncludes: number[] = [];
      for (const n of genreNames) {
        if (!nameToId.has(n) && tvNameToId.has(n)) tvOnlyIncludes.push(tvNameToId.get(n)!);
      }
      const tvOnlyExcludes: number[] = [];
      for (const n of excludeGenreNames) {
        if (!nameToId.has(n) && tvNameToId.has(n)) tvOnlyExcludes.push(tvNameToId.get(n)!);
      }
      genreIds = [...new Set([...translated, ...tvOnlyIncludes])];
      excludeGenreIds = [...new Set([...translatedExclude, ...tvOnlyExcludes])];
    } else {
      genreIds = rawGenreIds;
      excludeGenreIds = rawExcludeGenreIds;
    }

    // Resolve keyword phrases to TMDB keyword IDs + labels.
    const resolvedKeywords = raw.keywords.length > 0 ? await resolveKeywordsFull(raw.keywords) : [];
    // Resolve cast names to TMDB person IDs + canonical names.
    const resolvedCast = raw.cast.length > 0 ? await resolveCastFull(raw.cast) : [];

    // Provider short codes → TMDB provider IDs.
    const providerIds: number[] = [];
    for (const short of raw.providers) {
      const p = STREAMING_PROVIDERS.find((sp) => sp.short === short);
      if (p) providerIds.push(p.id);
    }

    // Build URL query params for /movies.
    const qp = new URLSearchParams();
    // Default sort is relevance — AI-triggered searches should feel organized
    // by how well titles match the prompt, not alphabetical or by raw popularity.
    qp.set("sort", "relevance");
    if (raw.mediaType !== "any") qp.set("type", raw.mediaType);
    if (genreIds.length > 0) qp.set("genres", genreIds.join(","));
    if (excludeGenreIds.length > 0) qp.set("excludeGenres", excludeGenreIds.join(","));
    // Genre mode — /movies page treats unset as "any", but setting it
    // explicitly (a) keeps the chip toggle in sync and (b) lets the
    // relevance-sort code preserve strict-AND when the user prompted that way.
    if (genreIds.length >= 2) qp.set("genreMode", raw.genreMode);

    // Year range — precise overrides era buckets. Fall back to era if no precise.
    const currentYear = new Date().getFullYear();
    let yearFrom: number | null = raw.yearFrom;
    let yearTo: number | null = raw.yearTo;
    if (yearFrom == null && yearTo == null && raw.era.length > 0) {
      if (raw.era.includes("recent")) yearFrom = currentYear - 3;
      if (raw.era.includes("2010s")) { yearFrom = yearFrom ?? 2010; yearTo = 2019; }
      if (raw.era.includes("2000s")) { yearFrom = yearFrom ?? 2000; yearTo = yearTo ?? 2009; }
      if (raw.era.includes("90s")) { yearFrom = yearFrom ?? 1990; yearTo = yearTo ?? 1999; }
      if (raw.era.includes("80s")) { yearFrom = yearFrom ?? 1980; yearTo = yearTo ?? 1989; }
      if (raw.era.includes("70s")) { yearFrom = yearFrom ?? 1970; yearTo = yearTo ?? 1979; }
      if (raw.era.includes("classic")) { yearFrom = yearFrom ?? 1900; yearTo = yearTo ?? 1969; }
    }
    if (yearFrom != null) qp.set("yearFrom", String(yearFrom));
    if (yearTo != null) qp.set("yearTo", String(yearTo));

    if (raw.minRating != null) {
      qp.set("ratingVal", String(raw.minRating));
      qp.set("ratingOp", "gte");
    }

    // Single-language whitelist maps directly to /movies' language param.
    // Multi-language whitelist has no TMDB-native equivalent — surface as
    // excludeLanguages (blacklist every language NOT in the whitelist would
    // be wrong) so drop multi-language whitelist for now; most prompts hit
    // the single-code path.
    if (raw.originalLanguage.length === 1) qp.set("language", raw.originalLanguage[0]);
    if (raw.excludeOriginalLanguages.length > 0) qp.set("excludeLanguages", raw.excludeOriginalLanguages.join(","));
    if (raw.excludeAnime) qp.set("excludeAnime", "1");

    if (providerIds.length > 0) qp.set("providers", providerIds.join(","));
    if (raw.mpaaRatings.length > 0) qp.set("mpaa", raw.mpaaRatings.join(","));
    if (resolvedKeywords.length > 0) {
      qp.set("keywords", resolvedKeywords.map((k) => k.id).join(","));
      qp.set("keywordLabels", resolvedKeywords.map((k) => k.name).join(","));
    }
    if (resolvedCast.length > 0) {
      qp.set("cast", resolvedCast.map((c) => c.id).join(","));
      qp.set("castLabels", resolvedCast.map((c) => c.name).join(","));
    }

    // Severity caps passed through as-is; /movies reads them.
    const severityFields: (keyof typeof raw)[] = [
      "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes",
      "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes",
    ];
    for (const f of severityFields) {
      const v = raw[f];
      if (typeof v === "string") qp.set(f, v);
    }

    // Count how many dimensions ended up in the hidden AI pill so the UI can
    // decide whether to render it.
    const hiddenCount = (excludeGenreIds.length > 0 ? 1 : 0)
      + (raw.excludeOriginalLanguages.length > 0 ? 1 : 0)
      + (raw.excludeAnime ? 1 : 0)
      + severityFields.reduce((acc, f) => acc + (typeof raw[f] === "string" ? 1 : 0), 0);

    const url = `/movies${qp.toString() ? `?${qp.toString()}` : ""}`;
    await logAiUsage(user.id, "movies_search");
    return NextResponse.json({ url, hiddenCount, filters: raw });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("AI movies search — Anthropic auth failed:", err.message);
      return NextResponse.json({ error: "AI service isn't configured — please contact an admin." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`AI movies search — Anthropic API error ${err.status}:`, err.message);
      return NextResponse.json({ error: `AI error (${err.status}): ${err.message}` }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI movies search — unexpected error:", message, err);
    return NextResponse.json({ error: `AI extraction failed: ${message}` }, { status: 500 });
  }
}
