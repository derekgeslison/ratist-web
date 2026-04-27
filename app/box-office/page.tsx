import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { TrendingUp, DollarSign, BarChart3, AlertTriangle, Coins, Calendar, Filter, Info } from "lucide-react";
import {
  getTopGrossing,
  getHighestBudget,
  getROIRanking,
  getTopProfit,
  getLastCompleteYear,
} from "@/lib/box-office-queries";
import {
  formatBoxOffice,
  formatROI,
  type BoxOfficeRow,
} from "@/lib/box-office";

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

interface LeaderboardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rows: BoxOfficeRow[];
  /** Which derived value to print in the right-hand column. */
  metric: "revenue" | "budget" | "profit" | "roi";
}

function Leaderboard({ icon: Icon, title, subtitle, rows, metric }: LeaderboardProps) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)]">
        <Icon className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{subtitle}</p>
        </div>
      </header>
      <ol className="divide-y divide-[var(--border)]">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-xs text-[var(--foreground-muted)] text-center">
            Not enough data yet for this leaderboard.
          </li>
        ) : (
          rows.map((row, idx) => (
            <LeaderboardRow key={row.tmdbId} row={row} rank={idx + 1} metric={metric} />
          ))
        )}
      </ol>
    </section>
  );
}

function LeaderboardRow({
  row,
  rank,
  metric,
}: {
  row: BoxOfficeRow;
  rank: number;
  metric: "revenue" | "budget" | "profit" | "roi";
}) {
  // The rendered metric value depends on which leaderboard the row is
  // part of — the same row appears in multiple boards and we don't
  // want to repeat the same number twice. Profit can legitimately be
  // negative for bombs; we still format it so the row reads "-$200M".
  const value =
    metric === "roi"
      ? formatROI(row.roi)
      : metric === "profit"
        ? row.profit != null
          ? row.profit < 0
            ? `−${formatBoxOffice(Math.abs(row.profit))}`
            : formatBoxOffice(row.profit)
          : null
        : metric === "budget"
          ? formatBoxOffice(row.budget)
          : formatBoxOffice(row.revenue);

  const year = row.releaseDate?.slice(0, 4) ?? "—";

  return (
    <li>
      <Link
        href={`/movies/${row.tmdbId}`}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-sm font-bold text-[var(--foreground-muted)] w-5 text-right tabular-nums shrink-0">
          {rank}
        </span>
        <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--background)]">
          {row.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w92${row.posterPath}`}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{row.title}</p>
          <p className="text-[11px] text-[var(--foreground-muted)]">{year}</p>
        </div>
        <span className="text-sm font-semibold text-white tabular-nums shrink-0">
          {value ?? "—"}
        </span>
      </Link>
    </li>
  );
}
