import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  getReleases,
  getUserTopTmdbGenres,
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

  // 6 months out is the same horizon TMDB's /movie/upcoming uses.
  // Past it, primary_release_date filtering still works but the
  // popularity sort surfaces almost nothing useful that far ahead.
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

  // For You — match against the user's top genres. Skip when the
  // user has no profile yet (new account or no rated films) so we
  // don't show a misleading "personalized" feed full of generic hits.
  const topGenresPromise = userId ? getUserTopTmdbGenres(userId, 5) : Promise.resolve([]);

  // Initial unfiltered feed (next 90 days, popularity-sorted) hands
  // off to the client component, which then refetches on filter
  // change. Keeping the initial load a popularity feed matches the
  // "what's hot coming up" mental model most users want first.
  const initialFeedPromise = getReleases({
    fromDate: today,
    toDate: daysFromNow(90),
    sortBy: "popularity.desc",
  });

  const [thisWeek, topGenres, initialFeed] = await Promise.all([
    thisWeekPromise,
    topGenresPromise,
    initialFeedPromise,
  ]);

  // For You feed only makes sense if we have at least one strong
  // genre to filter by. Otherwise the "personalized" section would
  // just be the same as the initial feed.
  const forYouPromise = topGenres.length > 0
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

  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-[var(--foreground-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      }
    >
      <ReleasesClient
        thisWeek={thisWeek.results.slice(0, 5)}
        forYou={forYou?.results.slice(0, 12) ?? null}
        topGenres={topGenres}
        initialFeed={initialFeed.results}
        genres={genres}
      />
    </Suspense>
  );
}
