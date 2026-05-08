import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import NavEntryRegister from "@/components/NavEntryRegister";
import TourClient from "./TourClient";

export const metadata: Metadata = {
  title: "Welcome to The Ratist — A 2-minute tour",
  description: "An interactive tour of The Ratist: rating with depth, Watch Companion, Screening Room, Film Diary, What Else Do I Know Them From, and the community.",
  alternates: { canonical: "/welcome" },
};

// 7-day revalidate (604800s). Next.js 16 requires this to be a
// literal number, not an expression — it gets statically read at
// build time. Poster and profile paths are stable in TMDB and the
// tour content is fixed, so refetching on every visit is wasteful.
export const revalidate = 604800;

const TMDB = "https://api.themoviedb.org/3";

interface TmdbId { key: string; id: number }

const MOVIE_IDS: TmdbId[] = [
  { key: "toyStory",      id: 862    },
  { key: "inception",     id: 27205  },
  { key: "dunePart2",     id: 693134 },
  { key: "knivesOut",     id: 546554 },
  // diary: pre-existing entries
  { key: "pastLives",     id: 666277 },
  { key: "holdovers",     id: 840430 },
  { key: "anatomy",       id: 915935 },
  // diary: addable options
  { key: "poorThings",    id: 792307 },
  { key: "kotfm",         id: 466420 },
  { key: "zoneInterest",  id: 467244 },
  { key: "oppenheimer",   id: 872585 },
  // Daniel Craig filmography
  { key: "skyfall",       id: 37724  },
  { key: "casinoRoyale",  id: 36557  },
  { key: "loganLucky",    id: 399170 },
  { key: "glassOnion",    id: 661374 },
  // Ana de Armas
  { key: "br2049",        id: 335984 },
  { key: "noTimeToDie",   id: 370172 },
  { key: "blonde",        id: 301502 },
  // Chris Evans
  { key: "winterSoldier", id: 100402 },
  { key: "snowpiercer",   id: 110415 },
  { key: "grayMan",       id: 725201 },
  // Jamie Lee Curtis
  { key: "halloween78",   id: 948    },
  { key: "eeaao",         id: 545611 },
  { key: "tradingPlaces", id: 1621   },
  // Step 7 watchlist
  { key: "substance",     id: 933260 },
  { key: "conclave",      id: 974576 },
  { key: "civilWar",      id: 929590 },
  { key: "wicked",        id: 402431 },
  // Step 8 mood recs (some reuse existing fetches above)
  { key: "johnWick",      id: 245891 },
  { key: "madMax",        id: 76341  },
  { key: "paddington2",   id: 346648 },
  // Step 9 collections — heist set + parasite for "hits on every axis"
  { key: "heat",          id: 949    },
  { key: "insideMan",     id: 388    },
  { key: "babyDriver",    id: 339403 },
  { key: "oceansEleven",  id: 161    },
  { key: "parasite",      id: 496243 },
  // Step 10 shared cast (Nolan filmography)
  { key: "interstellar",  id: 157336 },
  { key: "tenet",         id: 577922 },
];

const PERSON_IDS: TmdbId[] = [
  { key: "leo",    id: 6193   },
  { key: "daniel", id: 8784   },
  { key: "ana",    id: 224513 },
  { key: "chris",  id: 16828  },
  { key: "jamie",  id: 8944   },
  // Step 10 shared cast & crew
  { key: "nolan",  id: 525    },
  { key: "murphy", id: 2037   },
  { key: "rian",   id: 67367  },
  { key: "caine",  id: 3895   },
  { key: "zimmer", id: 947    },
];

async function fetchTmdbPath(kind: "movie" | "person", id: number): Promise<string | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${TMDB}/${kind}/${id}?api_key=${key}`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (kind === "movie" ? data.poster_path : data.profile_path) ?? null;
  } catch { return null; }
}

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch { return false; }
}

export interface TourImages {
  movies: Record<string, string | null>;
  people: Record<string, string | null>;
  /** Optional "in the wild" screenshots, keyed by step. Resolved
   *  server-side so the client doesn't need fs access. */
  screenshots: Record<string, { src: string; w: number; h: number } | null>;
}

const SCREENSHOT_SLOTS: Record<string, { src: string; w: number; h: number }> = {
  rate:       { src: "/welcome/in-the-wild-rate.png",       w: 1600, h: 900 },
  companion:  { src: "/welcome/in-the-wild-companion.png",  w: 1600, h: 900 },
  screening:  { src: "/welcome/in-the-wild-screening.png",  w: 1600, h: 900 },
  diary:      { src: "/welcome/in-the-wild-diary.png",      w: 1600, h: 900 },
  actor:      { src: "/welcome/in-the-wild-actor.png",      w: 1600, h: 900 },
  community:  { src: "/welcome/in-the-wild-community.png",  w: 1600, h: 900 },
  watchlist:   { src: "/welcome/in-the-wild-watchlist.png",   w: 1600, h: 900 },
  recommend:   { src: "/welcome/in-the-wild-recommend.png",   w: 1600, h: 900 },
  collections: { src: "/welcome/in-the-wild-collections.png", w: 1600, h: 900 },
  sharedCast:  { src: "/welcome/in-the-wild-shared-cast.png", w: 1600, h: 900 },
};

export default async function WelcomePage() {
  // Parallelize all 29 TMDB lookups. With Next's fetch cache + 7-day
  // revalidate, only the very first uncached visit pays the network cost.
  const [moviePaths, personPaths] = await Promise.all([
    Promise.all(MOVIE_IDS.map((m) => fetchTmdbPath("movie", m.id))),
    Promise.all(PERSON_IDS.map((p) => fetchTmdbPath("person", p.id))),
  ]);

  const images: TourImages = {
    movies: Object.fromEntries(MOVIE_IDS.map((m, i) => [m.key, moviePaths[i]])),
    people: Object.fromEntries(PERSON_IDS.map((p, i) => [p.key, personPaths[i]])),
    screenshots: Object.fromEntries(
      Object.entries(SCREENSHOT_SLOTS).map(([k, v]) => [k, imageExists(v.src) ? v : null]),
    ),
  };

  return (
    <>
      <NavEntryRegister title="Welcome" />
      <TourClient images={images} />
    </>
  );
}
