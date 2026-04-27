import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, DollarSign, BarChart3, AlertTriangle, Coins, Calendar, Filter, Info, Layers } from "lucide-react";
import {
  getTopGrossing,
  getHighestBudget,
  getROIRanking,
  getTopProfit,
  getLastCompleteYear,
} from "@/lib/box-office-queries";
import { Leaderboard } from "@/components/box-office/Leaderboard";

export const metadata: Metadata = {
  title: "Box Office Insights",
  description:
    "Lifetime box-office leaderboards: highest grossing movies, biggest profits, best and worst ROI, biggest budgets, and top performers by year.",
  alternates: { canonical: "/box-office" },
};

// Leaderboards are mostly static between TMDB syncs (revenue/budget
// only change when a movie is re-fetched) so we can revalidate every
// 6 hours rather than re-querying on every page load. The deferred
// per-day cron we'll add in Stage 4 will refresh the underlying data
// at the same cadence, keeping the cached page in lockstep.
export const revalidate = 60 * 60 * 6;

export default async function BoxOfficePage() {
  const lastYear = getLastCompleteYear();

  // Run all leaderboard queries in parallel — they're independent and
  // the page is bottlenecked by the slowest one.
  const [
    topGrossing,
    topProfit,
    bestROI,
    worstROI,
    highestBudget,
    topLastYear,
  ] = await Promise.all([
    getTopGrossing(10),
    getTopProfit(10),
    getROIRanking("best", 10),
    getROIRanking("worst", 10),
    getHighestBudget(10),
    getTopGrossing(10, lastYear, lastYear),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office Insights</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)] max-w-2xl">
          Lifetime grosses, budgets, and ROI for movies tracked on The Ratist.
          Filter, rank, and drill into franchises, studios, and genres.
        </p>
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
      </div>

      {/* Leaderboard grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Leaderboard
          icon={TrendingUp}
          title="Top Grossing of All Time"
          subtitle="Lifetime worldwide gross"
          rows={topGrossing}
          metric="revenue"
        />
        <Leaderboard
          icon={DollarSign}
          title="Biggest Profit"
          subtitle="Lifetime gross minus production budget"
          rows={topProfit}
          metric="profit"
        />
        <Leaderboard
          icon={BarChart3}
          title="Best Return on Investment"
          subtitle={`ROI = revenue ÷ budget (min $100K budget)`}
          rows={bestROI}
          metric="roi"
        />
        <Leaderboard
          icon={AlertTriangle}
          title="Biggest Box Office Bombs"
          subtitle="Worst ROI (min $100K budget)"
          rows={worstROI}
          metric="roi"
        />
        <Leaderboard
          icon={Coins}
          title="Highest Production Budgets"
          subtitle="Most expensive films ever made"
          rows={highestBudget}
          metric="budget"
        />
        <Leaderboard
          icon={Calendar}
          title={`Top Grossing of ${lastYear}`}
          subtitle="Last completed calendar year"
          rows={topLastYear}
          metric="revenue"
        />
      </div>
    </div>
  );
}

