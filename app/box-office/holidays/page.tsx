import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Info } from "lucide-react";
import { getTopGrossingByReleaseWindow } from "@/lib/box-office-queries";
import { RELEASE_WINDOWS } from "@/lib/box-office";
import { Leaderboard } from "@/components/box-office/Leaderboard";

export const metadata: Metadata = {
  title: "Holiday Box Office",
  description:
    "Highest grossing movies released during major holiday windows: Memorial Day, July 4, Labor Day, Halloween, Thanksgiving, Christmas, and Valentine's Day.",
  alternates: { canonical: "/box-office/holidays" },
};

// Window queries are heavier (in-app filter on top of an over-fetched
// candidate set); cache for the full 6 hours like the rest of /box-office.
export const revalidate = 21600;

export default async function BoxOfficeHolidaysPage() {
  // Each window query is independent of the others, so fire them in
  // parallel. Each pulls up to 5,000 candidate rows, so we keep the
  // window count modest (currently 7).
  const results = await Promise.all(
    RELEASE_WINDOWS.map((w) => getTopGrossingByReleaseWindow(w.start, w.end, 10)),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Holiday Box Office</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Top-grossing films released into the major holiday windows that
          studios traditionally target.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Windows are anchored to a fixed date range (e.g. Christmas =
          Dec 18–31) rather than the actual moving holiday weekends, since
          TMDB only stores release date — not which weekend a film opened on.
          Films are matched by month and day across all years.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {RELEASE_WINDOWS.map((w, idx) => {
          const subtitle = `${monthDay(w.start)} – ${monthDay(w.end)}`;
          return (
            <Leaderboard
              key={w.key}
              icon={Calendar}
              title={w.label}
              subtitle={subtitle}
              rows={results[idx]}
              metric="revenue"
              emptyMessage="No tracked films released in this window yet."
            />
          );
        })}
      </div>
    </div>
  );
}

function monthDay(d: { month: number; day: number }): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.month - 1]} ${d.day}`;
}
