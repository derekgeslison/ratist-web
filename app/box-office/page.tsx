import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, DollarSign, BarChart3, AlertTriangle, Coins, Calendar, Filter, Info, Layers, Users, Clapperboard, Flame, Sparkles, Film, Building2 } from "lucide-react";
import {
  getTopGrossing,
  getHighestBudget,
  getROIRanking,
  getTopProfit,
  getLastCompleteYear,
  getTopGrossingByReleaseWindow,
} from "@/lib/box-office-queries";
import { getMostRecentlyEndedWindow } from "@/lib/box-office";
import { Leaderboard } from "@/components/box-office/Leaderboard";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";

export const metadata: Metadata = {
  title: "Box Office Insights",
  description:
    "Lifetime box-office leaderboards: highest grossing movies, biggest profits, best and worst ROI, biggest budgets, and top performers by year.",
  alternates: { canonical: "/box-office" },
  openGraph: {
    title: "Box Office Insights — The Ratist",
    description: "Lifetime grosses, profits, and ROI for every tracked film.",
    images: [{ url: "/api/og/box-office", width: 800, height: 520 }],
  },
};

// Leaderboards are mostly static between TMDB syncs (revenue/budget
// only change when a movie is re-fetched) so we can revalidate every
// 6 hours rather than re-querying on every page load. Next.js's
// static analyzer can only read literal numbers from `revalidate`
// exports, so the value is hardcoded (60 * 60 * 6 = 21600) rather
// than expressed as a multiplication.
export const revalidate = 21600;

export default async function BoxOfficePage() {
  const now = new Date();
  const lastYear = getLastCompleteYear(now);
  const currentYear = String(now.getUTCFullYear());
  const decadeStart = String(Math.floor(now.getUTCFullYear() / 10) * 10);

  // The "Last 90 Days" tile was duplicating YTD data early in the
  // year, so rotate to the most recently ended holiday window
  // instead — gives the landing a freshness signal that varies
  // through the year. Returns null only if every window's end date
  // is in the future (impossible given the windows span the year).
  const lastWindow = getMostRecentlyEndedWindow(now);

  // Run all leaderboard queries in parallel — they're independent and
  // the page is bottlenecked by the slowest one.
  const [
    topGrossing,
    topProfit,
    bestROI,
    worstROI,
    highestBudget,
    topYTD,
    topLastYear,
    topThisDecade,
    topLastWindow,
  ] = await Promise.all([
    getTopGrossing(10),
    getTopProfit(10),
    getROIRanking("best", 10),
    getROIRanking("worst", 10),
    getHighestBudget(10),
    getTopGrossing(10, currentYear, currentYear),
    getTopGrossing(10, lastYear, lastYear),
    getTopGrossing(10, decadeStart, currentYear),
    lastWindow
      ? getTopGrossingByReleaseWindow(lastWindow.window.start, lastWindow.window.end, 10)
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-[var(--ratist-red)]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office Insights</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] max-w-2xl">
            Lifetime grosses, budgets, and ROI for movies tracked on The Ratist.
            Filter, rank, and drill into franchises, studios, and genres.
          </p>
        </div>
        <BoxOfficeShare
          path="/box-office"
          ogPath="/api/og/box-office"
          shareText="Box Office Insights — The Ratist"
        />
      </div>

      {/* Data disclaimer — applies to every leaderboard on this page,
          so it lives once at the top instead of being repeated. */}
      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Box-office figures are sourced from TMDB and reflect <strong className="text-white/80">cumulative lifetime</strong> grosses, not daily or
          weekly tallies. Coverage is strongest for theatrically-released studio films
          and weakest for indie, foreign, and pre-1980 titles. ROI rankings exclude
          films with budgets under $100K to suppress micro-budget outliers.
        </p>
      </div>

      {/* Quick filter / drill-down hub */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/box-office/all"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Filter className="w-4 h-4" />
          Browse the full list
        </Link>
        <Link
          href="/box-office/by-decade"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Calendar className="w-4 h-4" />
          By decade
        </Link>
        <Link
          href="/box-office/holidays"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Holiday releases
        </Link>
        <Link
          href="/box-office/by-genre"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Layers className="w-4 h-4" />
          By genre
        </Link>
        <Link
          href="/box-office/by-rating"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Layers className="w-4 h-4" />
          By MPA rating
        </Link>
        <Link
          href="/box-office/by-actor"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Users className="w-4 h-4" />
          Top actors
        </Link>
        <Link
          href="/box-office/by-director"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Clapperboard className="w-4 h-4" />
          Top directors
        </Link>
        <Link
          href="/box-office/franchises"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Film className="w-4 h-4" />
          Franchises
        </Link>
        <Link
          href="/box-office/studios"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Building2 className="w-4 h-4" />
          Studios
        </Link>
        <Link
          href="/box-office/recent"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Flame className="w-4 h-4" />
          Recent releases
        </Link>
      </div>

      {/* Leaderboard grid. Each tile carries:
            • viewAllHref → drill into /box-office/all with the
              matching filter+sort
            • share       → ShareButton in the tile header with a
              targeted OG image for that specific leaderboard
          The page-level share above covers the hub itself; the per-
          tile shares cover the individual lists, which is what users
          actually want to share. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Leaderboard
          icon={TrendingUp}
          title="Top Grossing of All Time"
          subtitle="Lifetime worldwide gross"
          rows={topGrossing}
          metric="revenue"
          viewAllHref="/box-office/all?sort=revenue-desc"
          share={{
            path: "/box-office/all?sort=revenue-desc",
            ogPath: "/api/og/box-office?page=topGrossing",
            shareText: "Top Grossing Movies of All Time — The Ratist",
          }}
        />
        <Leaderboard
          icon={DollarSign}
          title="Biggest Profit"
          subtitle="Lifetime gross minus production budget"
          rows={topProfit}
          metric="profit"
          viewAllHref="/box-office/all?sort=profit-desc"
          share={{
            path: "/box-office/all?sort=profit-desc",
            ogPath: "/api/og/box-office?page=topProfit",
            shareText: "Biggest Profit of All Time — The Ratist",
          }}
        />
        <Leaderboard
          icon={BarChart3}
          title="Best Return on Investment"
          subtitle={`ROI = revenue ÷ budget (min $100K budget)`}
          rows={bestROI}
          metric="roi"
          viewAllHref="/box-office/all?sort=roi-desc"
          share={{
            path: "/box-office/all?sort=roi-desc",
            ogPath: "/api/og/box-office?page=bestROI",
            shareText: "Best Box-Office ROI of All Time — The Ratist",
          }}
        />
        <Leaderboard
          icon={AlertTriangle}
          title="Biggest Box Office Bombs"
          subtitle="Worst ROI (min $100K budget)"
          rows={worstROI}
          metric="roi"
          viewAllHref="/box-office/all?sort=roi-asc"
          share={{
            path: "/box-office/all?sort=roi-asc",
            ogPath: "/api/og/box-office?page=worstROI",
            shareText: "Biggest Box Office Bombs — The Ratist",
          }}
        />
        <Leaderboard
          icon={Coins}
          title="Highest Production Budgets"
          subtitle="Most expensive films ever made"
          rows={highestBudget}
          metric="budget"
          viewAllHref="/box-office/all?sort=budget-desc"
          share={{
            path: "/box-office/all?sort=budget-desc",
            ogPath: "/api/og/box-office?page=highestBudget",
            shareText: "Highest Production Budgets — The Ratist",
          }}
        />
        <Leaderboard
          icon={Calendar}
          title={`Top Grossing of ${lastYear}`}
          subtitle="Last completed calendar year"
          rows={topLastYear}
          metric="revenue"
          viewAllHref={`/box-office/year/${lastYear}`}
          share={{
            path: `/box-office/year/${lastYear}`,
            ogPath: `/api/og/box-office?page=year&year=${lastYear}`,
            shareText: `Highest Grossing Movies of ${lastYear} — The Ratist`,
          }}
        />
        {/* YTD + recent tiles intentionally come after the "completed
            year" tile so the most reliable data lands first. The
            disclaimer copy on each tile makes the in-progress nature
            of the numbers explicit — TMDB updates revenue gradually
            as theatrical runs unfold, so YTD/last-90-day rankings
            reshuffle through the year. */}
        <Leaderboard
          icon={Sparkles}
          title={`Top Grossing of ${currentYear} (YTD)`}
          subtitle="Year-to-date — still accumulating"
          rows={topYTD}
          metric="revenue"
          viewAllHref={`/box-office/year/${currentYear}`}
          emptyMessage="Not enough YTD data yet — TMDB lags theatrical numbers."
          share={{
            path: `/box-office/year/${currentYear}`,
            ogPath: `/api/og/box-office?page=year&year=${currentYear}`,
            shareText: `Top Grossing of ${currentYear} (YTD) — The Ratist`,
          }}
        />
        <Leaderboard
          icon={Calendar}
          title={`Top Grossing of the ${decadeStart}s`}
          subtitle="So far this decade"
          rows={topThisDecade}
          metric="revenue"
          viewAllHref={`/box-office/all?sort=revenue-desc&releaseFrom=${decadeStart}-01-01&releaseTo=${currentYear}-12-31`}
          share={{
            path: `/box-office/all?sort=revenue-desc&releaseFrom=${decadeStart}-01-01&releaseTo=${currentYear}-12-31`,
            ogPath: `/api/og/box-office?page=decade&from=${decadeStart}&to=${currentYear}`,
            shareText: `Top Grossing of the ${decadeStart}s So Far — The Ratist`,
          }}
        />
        {/* Most-recently-ended holiday window. Title is dynamic so
            this tile reads "Top Valentine's Releases" through April,
            "Top Memorial Day Releases" through June, etc. — gives
            the landing a rotating "fresh" pick distinct from the
            time-bound tiles above. The View all link goes to the
            holidays hub so users can compare windows side-by-side. */}
        {lastWindow && (
          <Leaderboard
            icon={Flame}
            title={`Top ${lastWindow.window.label} Releases`}
            subtitle={`Lifetime gross — window most recently ended ${lastWindow.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
            rows={topLastWindow}
            metric="revenue"
            viewAllHref="/box-office/holidays"
            share={{
              path: "/box-office/holidays",
              ogPath: `/api/og/box-office?page=holiday&key=${lastWindow.window.key}`,
              shareText: `Top ${lastWindow.window.label} Releases — The Ratist`,
            }}
          />
        )}
      </div>
    </div>
  );
}

