/**
 * Reusable leaderboard tile used across /box-office and the
 * /box-office/* aggregation pages. Each tile renders a numbered list
 * of top movies with a configurable right-hand metric column.
 */
import Link from "next/link";
import Image from "next/image";
import {
  formatBoxOffice,
  formatROI,
  type BoxOfficeRow,
} from "@/lib/box-office";
import { BoxOfficeShare } from "./BoxOfficeShare";

export interface LeaderboardShareConfig {
  /** Path of the page the share opens, beginning with /. Usually
   *  the same as `viewAllHref` when one is set. */
  path: string;
  /** Path of the OG image endpoint, beginning with /api/og/. */
  ogPath: string;
  /** Text shown in the share modal title and the social template. */
  shareText: string;
}

export interface LeaderboardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rows: BoxOfficeRow[];
  /** Which derived value to print in the right-hand column. */
  metric: "revenue" | "budget" | "profit" | "roi";
  /** Optional href for a "View all →" link in the header. */
  viewAllHref?: string;
  /** Empty-state message override; defaults to a generic line. */
  emptyMessage?: string;
  /** When set, renders a small ShareButton next to the title — lets
   *  users share an individual leaderboard rather than the page,
   *  which is what they actually came for on a multi-leaderboard
   *  hub like /box-office or /box-office/by-genre. */
  share?: LeaderboardShareConfig;
}

export function Leaderboard({
  icon: Icon,
  title,
  subtitle,
  rows,
  metric,
  viewAllHref,
  emptyMessage,
  share,
}: LeaderboardProps) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <header className="flex items-start gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Icon className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{subtitle}</p>
        </div>
        {share && (
          <div className="shrink-0 self-center">
            <BoxOfficeShare path={share.path} ogPath={share.ogPath} shareText={share.shareText} compact />
          </div>
        )}
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-xs text-[var(--ratist-red)] hover:underline shrink-0 self-center whitespace-nowrap"
          >
            View all →
          </Link>
        )}
      </header>
      <ol className="divide-y divide-[var(--border)]">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-xs text-[var(--foreground-muted)] text-center">
            {emptyMessage ?? "Not enough data yet for this leaderboard."}
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
  metric: LeaderboardProps["metric"];
}) {
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
