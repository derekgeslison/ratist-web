/**
 * wikidata.ts
 *
 * Client for Wikidata's SPARQL endpoint to fetch awards/nominations data.
 * Used for movies, TV shows, and celebrities.
 *
 * Key Wikidata properties:
 *   P166  = award received (wins)
 *   P1411 = nominated for (nominations)
 *   P585  = point in time (year qualifier)
 *   P805  = statement is subject of (ceremony qualifier)
 *   P1686 = for work (which film the award was for)
 *   P4947 = TMDB movie ID
 *   P4985 = TMDB person ID
 *   P345  = IMDb ID (fallback, more complete coverage)
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Ratist/1.0 (https://theratist.com; contact@theratist.com)";
const MIN_QUERY_INTERVAL_MS = 1100; // Wikidata asks for >=1s between queries
const QUERY_TIMEOUT_MS = 55000; // Under Wikidata's 60s hard timeout

let lastQueryTime = 0;

// ─── SPARQL client ──────────────────────────────────────────────────────────

interface SparqlBinding {
  [key: string]: { type: string; value: string } | undefined;
}

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

async function sparqlFetch(query: string, retries = 1): Promise<SparqlBinding[]> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastQueryTime;
  if (elapsed < MIN_QUERY_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_QUERY_INTERVAL_MS - elapsed));
  }
  lastQueryTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const res = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      body: `query=${encodeURIComponent(query)}`,
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 429 && retries > 0) {
      // Back off and retry once
      await new Promise((r) => setTimeout(r, 5000));
      return sparqlFetch(query, retries - 1);
    }

    if (!res.ok) {
      throw new Error(`Wikidata SPARQL error ${res.status}: ${res.statusText}`);
    }

    const data: SparqlResponse = await res.json();
    return data.results.bindings;
  } finally {
    clearTimeout(timeout);
  }
}

/** Extract the Q-ID from a Wikidata entity URI like http://www.wikidata.org/entity/Q19020 */
function qid(uri: string | undefined | null): string | null {
  if (!uri) return null;
  const match = uri.match(/Q\d+$/);
  return match ? match[0] : null;
}

function val(binding: SparqlBinding, key: string): string | null {
  return binding[key]?.value ?? null;
}

// ─── Award result types ─────────────────────────────────────────────────────

export interface WikidataAwardResult {
  awardWikidataId: string | null;
  categoryLabel: string;
  isWinner: boolean;
  year: number | null;
  ceremonyLabel: string | null;
  /** For person awards: the TMDB ID of the work they won for */
  forWorkTmdbId: number | null;
  forWorkImdbId: string | null;
  forWorkLabel: string | null;
  /** For movie awards: the person who won (e.g., Best Director) */
  personTmdbId: number | null;
  personLabel: string | null;
}

// ─── Shared helpers for split queries ────────────────────────────────────────

function buildEntityFilter(idProp: string, tmdbId: number, imdbId?: string | null): string {
  return imdbId
    ? `{ ?entity wdt:${idProp} "${tmdbId}" } UNION { ?entity wdt:P345 "${imdbId}" }`
    : `?entity wdt:${idProp} "${tmdbId}"`;
}

function mapBindings(bindings: SparqlBinding[], isWinner: boolean): WikidataAwardResult[] {
  return bindings.map((b) => ({
    awardWikidataId: qid(val(b, "awardUri")),
    categoryLabel: val(b, "awardLabel") ?? "Unknown Award",
    isWinner,
    year: b.year?.value ? parseInt(b.year.value) : null,
    ceremonyLabel: val(b, "ceremonyLabel"),
    forWorkTmdbId: b.workTmdbId?.value ? parseInt(b.workTmdbId.value) : null,
    forWorkImdbId: val(b, "workImdbId"),
    forWorkLabel: val(b, "workLabel"),
    personTmdbId: b.personTmdbId?.value ? parseInt(b.personTmdbId.value) : null,
    personLabel: val(b, "personLabel"),
  }));
}

// ─── Movie awards query ─────────────────────────────────────────────────────

/**
 * Fetch all awards/nominations for a movie from Wikidata.
 * Uses two separate queries (wins + nominations) to avoid UNION timeouts.
 */
export async function fetchMovieAwards(
  tmdbId: number,
  imdbId?: string | null
): Promise<WikidataAwardResult[]> {
  const entityFilter = buildEntityFilter("P4947", tmdbId, imdbId);

  const winsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ${entityFilter}
      ?entity p:P166 ?stmt .
      ?stmt ps:P166 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const nomsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ${entityFilter}
      ?entity p:P1411 ?stmt .
      ?stmt ps:P1411 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const [wins, noms] = await Promise.all([
    sparqlFetch(winsQuery).catch(() => []),
    sparqlFetch(nomsQuery).catch(() => []),
  ]);

  return [...mapBindings(wins, true), ...mapBindings(noms, false)];
}

// ─── Person awards query ────────────────────────────────────────────────────

/**
 * Fetch all awards/nominations for a person (actor, director, etc.) from Wikidata.
 * Uses two separate queries to avoid UNION timeouts.
 */
export async function fetchPersonAwards(
  tmdbId: number,
  imdbId?: string | null
): Promise<WikidataAwardResult[]> {
  const entityFilter = buildEntityFilter("P4985", tmdbId, imdbId);

  const winsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel ?workLabel ?workTmdbId ?workImdbId WHERE {
      ${entityFilter}
      ?entity p:P166 ?stmt .
      ?stmt ps:P166 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      OPTIONAL {
        ?stmt pq:P1686 ?work .
        ?work rdfs:label ?workLabel . FILTER(LANG(?workLabel) = "en")
        OPTIONAL { ?work wdt:P4947 ?workTmdbId }
        OPTIONAL { ?work wdt:P345 ?workImdbId }
      }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const nomsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel ?workLabel ?workTmdbId ?workImdbId WHERE {
      ${entityFilter}
      ?entity p:P1411 ?stmt .
      ?stmt ps:P1411 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      OPTIONAL {
        ?stmt pq:P1686 ?work .
        ?work rdfs:label ?workLabel . FILTER(LANG(?workLabel) = "en")
        OPTIONAL { ?work wdt:P4947 ?workTmdbId }
        OPTIONAL { ?work wdt:P345 ?workImdbId }
      }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const [wins, noms] = await Promise.all([
    sparqlFetch(winsQuery).catch(() => []),
    sparqlFetch(nomsQuery).catch(() => []),
  ]);

  return [...mapBindings(wins, true), ...mapBindings(noms, false)];
}

// ─── TV show awards query ───────────────────────────────────────────────────

/**
 * Fetch awards for a TV show. Uses IMDb ID since Wikidata lacks a TMDB TV ID property.
 * Uses two separate queries to avoid UNION timeouts.
 */
export async function fetchTVShowAwards(
  imdbId: string
): Promise<WikidataAwardResult[]> {
  const winsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ?entity wdt:P345 "${imdbId}" .
      ?entity p:P166 ?stmt .
      ?stmt ps:P166 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const nomsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ?entity wdt:P345 "${imdbId}" .
      ?entity p:P1411 ?stmt .
      ?stmt ps:P1411 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const [wins, noms] = await Promise.all([
    sparqlFetch(winsQuery).catch(() => []),
    sparqlFetch(nomsQuery).catch(() => []),
  ]);

  return [...mapBindings(wins, true), ...mapBindings(noms, false)];
}

// ─── Bulk query: Oscar-nominated movie TMDB IDs ─────────────────────────────

/**
 * Lightweight bulk query: returns TMDB IDs of movies nominated for Academy Awards
 * in a given year range. Used for initial data seeding.
 * Queries one year at a time to stay within Wikidata's 60s timeout.
 */
export async function fetchOscarMovieTmdbIds(
  ceremonyYear: number
): Promise<{ tmdbId: number; imdbId: string | null; title: string }[]> {
  const query = `
    SELECT DISTINCT ?movieLabel ?tmdbId ?imdbId WHERE {
      ?movie wdt:P31 wd:Q11424 .  # instance of: film

      {
        ?movie p:P166 ?stmt .
        ?stmt ps:P166 ?award .
        ?award wdt:P31*/wdt:P279* wd:Q19020 .  # Academy Award (or subclass)
        OPTIONAL { ?stmt pq:P585 ?date }
      } UNION {
        ?movie p:P1411 ?stmt .
        ?stmt ps:P1411 ?award .
        ?award wdt:P31*/wdt:P279* wd:Q19020 .
        OPTIONAL { ?stmt pq:P585 ?date }
      }

      FILTER(YEAR(?date) = ${ceremonyYear})

      ?movie wdt:P4947 ?tmdbId .
      OPTIONAL { ?movie wdt:P345 ?imdbId }

      ?movie rdfs:label ?movieLabel . FILTER(LANG(?movieLabel) = "en")
    }
    LIMIT 200
  `;

  const bindings = await sparqlFetch(query);
  return bindings.map((b) => ({
    tmdbId: parseInt(val(b, "tmdbId")!),
    imdbId: val(b, "imdbId"),
    title: val(b, "movieLabel") ?? "Unknown",
  }));
}

// ─── Award body identification ──────────────────────────────────────────────

/** Map known Wikidata award Q-IDs to award body slugs */
const AWARD_BODY_MAP: Record<string, { slug: string; name: string; shortName: string }> = {
  // Academy Awards (Oscars) — the Q-ID for the award itself plus common category IDs
  Q19020: { slug: "oscar", name: "Academy Awards", shortName: "Oscar" },
  // Golden Globe
  Q1011547: { slug: "golden-globe", name: "Golden Globe Awards", shortName: "Golden Globe" },
  // BAFTA
  Q185667: { slug: "bafta", name: "BAFTA Awards", shortName: "BAFTA" },
  // SAG Awards
  Q663732: { slug: "sag", name: "Screen Actors Guild Awards", shortName: "SAG" },
  // Cannes - Palme d'Or
  Q103360: { slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes" },
  // Primetime Emmy
  Q123737: { slug: "emmy", name: "Primetime Emmy Awards", shortName: "Emmy" },
  // Critics' Choice
  Q862764: { slug: "critics-choice", name: "Critics' Choice Awards", shortName: "Critics' Choice" },
  // Venice Film Festival
  Q846301: { slug: "venice", name: "Venice Film Festival", shortName: "Venice" },
  // Berlin Film Festival
  Q49024: { slug: "berlin", name: "Berlin International Film Festival", shortName: "Berlin" },
  // Independent Spirit Awards
  Q631041: { slug: "indie-spirit", name: "Independent Spirit Awards", shortName: "Indie Spirit" },
  // Tony Awards
  Q191874: { slug: "tony", name: "Tony Awards", shortName: "Tony" },
  // Directors Guild of America
  Q1199645: { slug: "dga", name: "Directors Guild of America Awards", shortName: "DGA" },
  // Writers Guild of America
  Q1199901: { slug: "wga", name: "Writers Guild of America Awards", shortName: "WGA" },
  // Producers Guild of America
  Q1199835: { slug: "pga", name: "Producers Guild of America Awards", shortName: "PGA" },
  // Peabody Awards
  Q381227: { slug: "peabody", name: "Peabody Awards", shortName: "Peabody" },
  // Saturn Awards
  Q478322: { slug: "saturn", name: "Saturn Awards", shortName: "Saturn" },
  // Television Critics Association
  Q393974: { slug: "tca", name: "Television Critics Association Awards", shortName: "TCA" },
  // Satellite Awards
  Q597250: { slug: "satellite", name: "Satellite Awards", shortName: "Satellite" },
  // Annie Awards
  Q378381: { slug: "annie", name: "Annie Awards", shortName: "Annie" },
  // Gotham Awards
  Q1416157: { slug: "gotham", name: "Gotham Awards", shortName: "Gotham" },
  // AFI Awards
  Q1127516: { slug: "afi", name: "AFI Awards", shortName: "AFI" },
};

/**
 * Try to identify which award body a Wikidata award category belongs to
 * based on its label text (fallback when Q-ID isn't in our map).
 */
export function identifyAwardBody(
  categoryLabel: string,
  wikidataId: string | null
): { slug: string; name: string; shortName: string } {
  // Check direct Q-ID match first
  if (wikidataId && AWARD_BODY_MAP[wikidataId]) {
    return AWARD_BODY_MAP[wikidataId];
  }

  // Fallback: match by label text
  const label = categoryLabel.toLowerCase();
  if (label.includes("academy award") || label.includes("oscar")) {
    return { slug: "oscar", name: "Academy Awards", shortName: "Oscar" };
  }
  if (label.includes("golden globe")) {
    return { slug: "golden-globe", name: "Golden Globe Awards", shortName: "Golden Globe" };
  }
  if (label.includes("bafta") || label.includes("british academy")) {
    return { slug: "bafta", name: "BAFTA Awards", shortName: "BAFTA" };
  }
  if (label.includes("screen actors guild") || label.includes("sag award")) {
    return { slug: "sag", name: "Screen Actors Guild Awards", shortName: "SAG" };
  }
  if (label.includes("palme") || label.includes("cannes") || label.includes("prix")) {
    return { slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes" };
  }
  if (label.includes("emmy") || label.includes("primetime")) {
    return { slug: "emmy", name: "Primetime Emmy Awards", shortName: "Emmy" };
  }
  if (label.includes("critics' choice") || label.includes("critics choice")) {
    return { slug: "critics-choice", name: "Critics' Choice Awards", shortName: "Critics' Choice" };
  }
  if (label.includes("venice") || label.includes("golden lion")) {
    return { slug: "venice", name: "Venice Film Festival", shortName: "Venice" };
  }
  if (label.includes("berlin") || label.includes("golden bear")) {
    return { slug: "berlin", name: "Berlin International Film Festival", shortName: "Berlin" };
  }
  if (label.includes("independent spirit")) {
    return { slug: "indie-spirit", name: "Independent Spirit Awards", shortName: "Indie Spirit" };
  }
  if (label.includes("tony award")) {
    return { slug: "tony", name: "Tony Awards", shortName: "Tony" };
  }
  if (label.includes("directors guild") || label.includes("dga award")) {
    return { slug: "dga", name: "Directors Guild of America Awards", shortName: "DGA" };
  }
  if (label.includes("writers guild") || label.includes("wga award")) {
    return { slug: "wga", name: "Writers Guild of America Awards", shortName: "WGA" };
  }
  if (label.includes("producers guild") || label.includes("pga award")) {
    return { slug: "pga", name: "Producers Guild of America Awards", shortName: "PGA" };
  }
  if (label.includes("peabody")) {
    return { slug: "peabody", name: "Peabody Awards", shortName: "Peabody" };
  }
  if (label.includes("saturn award")) {
    return { slug: "saturn", name: "Saturn Awards", shortName: "Saturn" };
  }
  if (label.includes("tca award") || label.includes("television critics association")) {
    return { slug: "tca", name: "Television Critics Association Awards", shortName: "TCA" };
  }
  if (label.includes("satellite award")) {
    return { slug: "satellite", name: "Satellite Awards", shortName: "Satellite" };
  }
  if (label.includes("annie award")) {
    return { slug: "annie", name: "Annie Awards", shortName: "Annie" };
  }
  if (label.includes("gotham")) {
    return { slug: "gotham", name: "Gotham Awards", shortName: "Gotham" };
  }
  if (label.includes("afi award") || label.includes("american film institute")) {
    return { slug: "afi", name: "AFI Awards", shortName: "AFI" };
  }

  // Catch-all: group unrecognized awards under "Other Awards"
  return { slug: "other", name: "Other Awards", shortName: "Other" };
}
