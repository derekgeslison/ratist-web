/**
 * Curated list of studios + production companies for the /movies and
 * /search filter UIs. TMDB's full company list is thousands long and
 * messy (regional variants, defunct subsidiaries, "Universal Pictures"
 * vs "Universal Studios Productions") — this whitelist is what users
 * recognize and want to browse by.
 *
 * IDs are TMDB company IDs. Verified against /search/company at the
 * time of writing; if any drift wrong, the filter for that one entry
 * just returns weird/empty results — easy to spot and fix in this
 * file without a deploy of anything else.
 *
 * `popular: true` flags entries we surface above the alphabetical list
 * in the filter dropdown — the ~10 most-clicked households-name
 * studios that benefit from one-tap selection.
 */

export interface StudioEntry {
  id: number;
  name: string;
  popular?: boolean;
}

export const STUDIOS: StudioEntry[] = [
  // Major / household-name studios — surface at top of dropdown.
  { id: 174,   name: "Warner Bros. Pictures",  popular: true },
  { id: 33,    name: "Universal Pictures",     popular: true },
  { id: 4,     name: "Paramount Pictures",     popular: true },
  { id: 5,     name: "Columbia Pictures",      popular: true },
  { id: 2,     name: "Walt Disney Pictures",   popular: true },
  { id: 420,   name: "Marvel Studios",         popular: true },
  { id: 1,     name: "Lucasfilm",              popular: true },
  { id: 3,     name: "Pixar",                  popular: true },
  { id: 41077, name: "A24",                    popular: true },
  { id: 90733, name: "NEON",                   popular: true },
  { id: 1632,  name: "Lionsgate",              popular: true },

  // Disney-adjacent
  { id: 127928, name: "20th Century Studios" },
  { id: 127929, name: "Searchlight Pictures" },
  { id: 6125,   name: "Skydance Media" },

  // Warner-adjacent
  { id: 12, name: "New Line Cinema" },
  { id: 9993, name: "DC Studios" },
  { id: 79, name: "Village Roadshow Pictures" },
  { id: 923, name: "Legendary Entertainment" },

  // Universal-adjacent
  { id: 10146, name: "Focus Features" },
  { id: 6704,  name: "Illumination" },
  { id: 521,   name: "DreamWorks Animation" },
  { id: 3172,  name: "Blumhouse Productions" },
  { id: 7,     name: "DreamWorks Pictures" },
  { id: 11461, name: "Bad Robot" },
  { id: 81,    name: "Plan B Entertainment" },

  // Sony-adjacent
  { id: 559,  name: "TriStar Pictures" },
  { id: 2251, name: "Sony Pictures Animation" },

  // Lionsgate-adjacent
  { id: 491,  name: "Summit Entertainment" },

  // Indie / arthouse
  { id: 47346, name: "Annapurna Pictures" },
  { id: 32171, name: "Bleecker Street" },
  { id: 307,   name: "IFC Films" },
  { id: 1030,  name: "Magnolia Pictures" },
  { id: 23449, name: "Open Road Films" },
  { id: 911,   name: "Roadside Attractions" },
  { id: 58,    name: "Sony Pictures Classics" },
  { id: 88606, name: "Vertical" },
  { id: 6735,  name: "Participant" },

  // Genre / faith-based / boutique
  { id: 142877, name: "Shudder", popular: true },
  { id: 11350,  name: "Angel Studios", popular: true },
  { id: 288516, name: "MUBI" },
  { id: 13240,  name: "Bron Studios" },

  // Streaming-era studios
  { id: 178464, name: "Netflix" },
  { id: 194232, name: "Apple Studios" },
  { id: 20580,  name: "Amazon Studios" },
  { id: 7429,   name: "HBO Films" },

  // Animation / international
  { id: 10342, name: "Studio Ghibli" },
  { id: 10163, name: "Working Title Films" },
  { id: 297,   name: "Aardman" },
  { id: 80893, name: "BBC Studios" },
  { id: 176067, name: "Cartoon Network Productions" },
  { id: 287101, name: "Nickelodeon" },

  // Legacy majors
  { id: 21, name: "Metro-Goldwyn-Mayer" },
  { id: 14, name: "Miramax" },
];

export function getStudioById(id: number): StudioEntry | undefined {
  return STUDIOS.find((s) => s.id === id);
}

// Resolve studio names (as the AI returns them) to TMDB company IDs. Drops
// anything that doesn't match a curated entry — names should already be
// constrained by the AI's enum schema, but we double-check here so a typo
// or stale enum entry doesn't crash the route.
export function resolveStudioNames(names: string[]): number[] {
  const out: number[] = [];
  for (const name of names) {
    const match = STUDIOS.find((s) => s.name === name);
    if (match) out.push(match.id);
  }
  return out;
}

/**
 * Resolve studio names + return any that don't match the whitelist.
 * /recommend uses the unresolved list to tell the user when an AI-
 * extracted studio name was silently dropped.
 */
export function resolveStudioNamesWithUnresolved(names: string[]): { ids: number[]; unresolved: string[] } {
  const ids: number[] = [];
  const unresolved: string[] = [];
  for (const name of names) {
    const match = STUDIOS.find((s) => s.name === name);
    if (match) ids.push(match.id);
    else unresolved.push(name);
  }
  return { ids, unresolved };
}
