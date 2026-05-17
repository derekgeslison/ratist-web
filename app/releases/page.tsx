import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  getReleases,
  getReleasesMultiPage,
  getUserTopTmdbGenres,
  movieToUnified,
  detectStreamingLaunches,
  classifyLaunchEvents,
} from "@/lib/releases";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import ReleasesClient from "./ReleasesClient";

export const metadata: Metadata = {
  title: "Release Calendar — Coming Soon",
  description:
    "Upcoming theatrical and digital movie releases. Filter by genre, MPA rating, country, and release type. Personalized to your taste when signed in.",
  alternates: { canonical: "/releases" },
  openGraph: {
    title: "Release Calendar — The Ratist",
    description: "Upcoming theatrical and digital releases, personalized to your taste.",
    images: [{ url: "/api/og/releases", width: 800, height: 520 }],
  },
};

// 6h revalidate matches the rest of the calendar-style pages. TMDB's
// upcoming-release dataset moves slowly day-to-day; an hourly refresh
// would just burn cache without changing the result.
export const revalidate = 21600;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function ReleasesPage() {
  // Resolve the current user from the auth cookie. We don't bounce
  // anonymous visitors — they just miss the For You section. Same
  // pattern as /for-you and other personalized pages.
  let userId: string | null = null;
  try {
    const token = (await cookies()).get("__session")?.value;
    if (token) {
      const decoded = await adminAuth.verifyIdToken(token);
      const user = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }
  } catch {
    // Token invalid / expired — treat as anonymous.
  }

  const today = todayISO();
  const sixMonths = daysFromNow(180);
  const sevenDays = daysFromNow(7);

  // "This Week" hero — top 5 by popularity over the next 7 days.
  // Theatrical-only (release_type 2|3) so streaming-only premieres
  // don't crowd out the actual cinema lineup.
  const thisWeekPromise = getReleases({
    fromDate: today,
    toDate: sevenDays,
    releaseTypes: [2, 3],
    sortBy: "popularity.desc",
  });

  // For You — match against the user's top genres. Returns null when
  // the user is anonymous or has zero genre signal (new account, no
  // ratings yet). Section then hidden client-side.
  const topGenresPromise = userId ? getUserTopTmdbGenres(userId, 5) : Promise.resolve(null);

  // Initial unfiltered feed: next 6 months, popularity-sorted.
  // Loads 8 pages in parallel — popularity-sort within a 6-month
  // window puts the genuinely-anticipated catalog across pages 1-8
  // and the long-tail/niche stuff at page 9+. Pre-loading the well-
  // known catalog on first paint replaces the old "click Load more
  // 7 times" pattern.
  const initialFeedPromise = getReleasesMultiPage({
    fromDate: today,
    toDate: sixMonths,
    sortBy: "popularity.desc",
  }, 8);

  // Streaming launches detected from the past 7 days of snapshots.
  // The cron writes one snapshot per item per day; we diff today vs
  // prior days to find newly-added providers. Returns an empty array
  // until the cron has run for at least 2 days.
  const streamingLaunchesPromise = (async () => {
    try {
      const events = await detectStreamingLaunches("US", 7);
      if (events.length === 0) return [];
      return await classifyLaunchEvents(events);
    } catch (err) {
      console.error("Streaming launches detection failed:", err);
      return [];
    }
  })();

  const [thisWeek, topGenres, initialFeed, streamingLaunches] = await Promise.all([
    thisWeekPromise,
    topGenresPromise,
    initialFeedPromise,
    streamingLaunchesPromise,
  ]);

  // Split the classified events: streaming-first goes in the main
  // feed alongside primary releases; post-theatrical goes in the
  // dedicated "Coming to streaming" section below.
  const streamingFirstLaunches = streamingLaunches
    .filter((e) => e.isStreamingFirst)
    .map((e) => e.unified);
  const postTheatricalLaunches = streamingLaunches
    .filter((e) => !e.isStreamingFirst)
    .map((e) => e.unified);

  // For You feed only renders when we have a real persona to anchor
  // against. The helper returns null in that case so we cleanly
  // skip the section.
  const forYouPromise = topGenres
    ? getReleases({
        fromDate: today,
        toDate: sixMonths,
        genres: topGenres,
        sortBy: "popularity.desc",
      })
    : Promise.resolve(null);
  const forYou = await forYouPromise;

  // Genre options for the filter dropdown — pulled from our local
  // Genre table (already populated from TMDB sync).
  const genres = await prisma.genre.findMany({
    where: { movies: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ItemList of the first 30 entries in the calendar so the Rich
  // Results Test sees something crawlable. URLs point at the
  // /movies/[id] detail page (which already carries Movie schema).
  const releasesItemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Upcoming releases",
    itemListElement: initialFeed.results.slice(0, 30).map((m, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `https://www.theratist.com/movies/${m.id}`,
      name: m.title,
    })),
  };

  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-[var(--foreground-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      }
    >
      {releasesItemListSchema.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(releasesItemListSchema) }} />
      )}
      <ReleasesClient
        thisWeek={thisWeek.results.slice(0, 5).map(movieToUnified)}
        forYou={forYou?.results.slice(0, 12).map(movieToUnified) ?? null}
        topGenresCount={topGenres?.length ?? 0}
        // Merge streaming-first launches into the initial feed —
        // they belong alongside primary releases in the date-grouped
        // calendar (their release_date was already overwritten with
        // the launch day during classification).
        initialFeed={[...initialFeed.results.map(movieToUnified), ...streamingFirstLaunches]}
        postTheatricalLaunches={postTheatricalLaunches}
        genres={genres}
      />
    </Suspense>
  );
}
