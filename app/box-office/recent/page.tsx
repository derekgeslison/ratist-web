import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Calendar, Info } from "lucide-react";
import {
  getTopGrossingByDateRange,
  formatDateYMD,
} from "@/lib/box-office-queries";
import { Leaderboard } from "@/components/box-office/Leaderboard";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";

export const metadata: Metadata = {
  title: "Recent Release Box Office",
  description:
    "Top-grossing movies released in the past week, month, and 90 days. Lifetime worldwide gross to date — TMDB updates revenue figures gradually as theatrical runs unfold.",
  alternates: { canonical: "/box-office/recent" },
  openGraph: {
    title: "Recent Release Box Office",
    description: "Top-grossing recent releases over the past 90 days.",
    images: [{ url: "/api/og/box-office?page=recent", width: 800, height: 520 }],
  },
};

// Recent windows update faster than the rest of /box-office (their
// underlying movies actively accrue revenue) but the cache cadence
// still suits a 6-hour revalidate — TMDB itself only refreshes
// box-office numbers daily-ish, and we sync via the on-detail-page
// path. Stage 4.5 (currently deferred) would add a faster cron
// targeting just this cohort.
export const revalidate = 21600;

export default async function BoxOfficeRecentPage() {
  const now = new Date();
  const today = formatDateYMD(now);

  // Build window boundaries. "Last N days" means N calendar days ago
  // up through today, inclusive. UTC-based date arithmetic so the
  // boundaries are stable regardless of the server timezone.
  const daysAgo = (n: number) =>
    formatDateYMD(new Date(now.getTime() - n * 24 * 60 * 60 * 1000));

  // First-of-current-month for the calendar-month tile. UTC again to
  // avoid month-boundary drift around UTC midnight.
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  // Calendar-month label, e.g. "April 2026".
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Last 7 Days was originally on this page but ended up duplicating
  // most of the calendar-month tile early in the month and showing
  // empty late in the month — not useful as a separate leaderboard.
  const [last30, thisMonth, last90] = await Promise.all([
    getTopGrossingByDateRange(daysAgo(30), today, 10),
    getTopGrossingByDateRange(monthStart, today, 10),
    getTopGrossingByDateRange(daysAgo(90), today, 10),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-6 h-6 text-[var(--ratist-red)]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Recent Release Box Office</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            What's grossed the most among recently-released films.
            {" "}
            <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
              ← Back to leaderboards
            </Link>
          </p>
        </div>
        <BoxOfficeShare
          path="/box-office/recent"
          ogPath="/api/og/box-office?page=recent"
          shareText="Recent Release Box Office — The Ratist"
        />
      </div>

      {/* Heavier disclaimer than the rest of /box-office — these
          windows are dominated by films whose theatrical runs are
          still active, so the numbers shift more than the lifetime
          views elsewhere. */}
      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          These leaderboards rank cumulative <strong className="text-white/80">lifetime</strong> gross
          for movies released in the named window — not weekend or daily
          totals. TMDB updates revenue figures gradually as theatrical runs
          unfold, so coverage of recent releases is uneven and rankings
          reshuffle every few days. Films released only days ago may have
          no revenue reported yet and will show up later as numbers come in.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Leaderboard
          icon={Calendar}
          title={monthLabel}
          subtitle="Calendar month to date"
          rows={thisMonth}
          metric="revenue"
          viewAllHref={`/box-office/all?sort=revenue-desc&releaseFrom=${monthStart}&releaseTo=${today}`}
          emptyMessage="No reported revenue this month yet."
        />
        <Leaderboard
          icon={Calendar}
          title="Last 30 Days"
          subtitle="Released in the past month"
          rows={last30}
          metric="revenue"
          viewAllHref={`/box-office/all?sort=revenue-desc&releaseFrom=${daysAgo(30)}&releaseTo=${today}`}
          emptyMessage="No reported revenue in the past month yet."
        />
        <Leaderboard
          icon={Flame}
          title="Last 90 Days"
          subtitle="Released in the past quarter"
          rows={last90}
          metric="revenue"
          viewAllHref={`/box-office/all?sort=revenue-desc&releaseFrom=${daysAgo(90)}&releaseTo=${today}`}
          emptyMessage="No reported revenue in the past quarter yet."
        />
      </div>
    </div>
  );
}
