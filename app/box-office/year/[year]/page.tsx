import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, Info, ArrowLeft, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTopGrossing } from "@/lib/box-office-queries";
import {
  formatBoxOffice,
  formatROI,
  BOX_OFFICE_FLOOR,
} from "@/lib/box-office";

export const revalidate = 21600;

interface Props {
  params: Promise<{ year: string }>;
}

const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getUTCFullYear() + 5;

function parseYear(input: string): number | null {
  if (!/^\d{4}$/.test(input)) return null;
  const y = parseInt(input, 10);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  return y;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const y = parseYear(year);
  if (!y) return { title: "Box Office by Year" };
  return {
    title: `Highest Grossing Movies of ${y}`,
    description: `Top-grossing movies of ${y} by lifetime worldwide box office. Ranked by total revenue with budgets and ROI.`,
    alternates: { canonical: `/box-office/year/${y}` },
    openGraph: {
      title: `Highest Grossing Movies of ${y}`,
      description: `The top-grossing films of ${y} ranked by lifetime worldwide gross.`,
      images: [{ url: `/api/og/box-office?page=year&year=${y}`, width: 800, height: 520 }],
    },
  };
}

export default async function BoxOfficeYearPage({ params }: Props) {
  const { year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();

  const yearStr = String(year);
  // Pull a deeper list than the leaderboard tile (top 100 instead
  // of 10) — this is the dedicated year page, so users came here for
  // depth. Headline totals roll up across the same 100.
  const movies = await getTopGrossing(100, yearStr, yearStr);

  // Cohort headline numbers — total films released this year that
  // have reportable revenue, plus year totals across the top-100.
  const cohortCount = await prisma.movie.count({
    where: {
      revenue: { gte: BOX_OFFICE_FLOOR },
      releaseDate: { gte: `${yearStr}-01-01`, lte: `${yearStr}-12-31` },
    },
  });
  const yearRevenue = movies.reduce((acc, m) => acc + (m.revenue ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Highest Grossing Movies of {year}
          </h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Ranked by lifetime worldwide gross.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Stat label={`Films from ${year} tracked`} value={cohortCount.toLocaleString()} />
        <Stat
          label={`Top 100 ${year} revenue`}
          value={formatBoxOffice(yearRevenue) ?? "—"}
        />
        <Stat
          label="Top film"
          value={movies[0]?.title ?? "—"}
          hint={movies[0] ? formatBoxOffice(movies[0].revenue) ?? undefined : undefined}
        />
      </div>

      {movies.length === 0 ? (
        <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-6 mb-6">
          <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            No films from {year} have reportable revenue yet. TMDB lags new
            releases for several weeks; pre-1980 films often have incomplete
            data.
          </p>
        </div>
      ) : null}

      {/* Per-film table */}
      {movies.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-6">
          <div className="hidden md:grid grid-cols-[2.5rem_3rem_1fr_8rem_8rem_6rem] gap-3 px-4 py-2 border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            <span className="text-right">#</span>
            <span></span>
            <span>Title</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">Budget</span>
            <span className="text-right">ROI</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {movies.map((m, idx) => (
              <li key={m.tmdbId}>
                <Link
                  href={`/movies/${m.tmdbId}`}
                  className="flex md:grid md:grid-cols-[2.5rem_3rem_1fr_8rem_8rem_6rem] items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-7 md:w-auto text-right tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--background)]">
                    {m.posterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${m.posterPath}`}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.title}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)] md:hidden">
                      {formatBoxOffice(m.revenue) ?? "—"}
                      {m.budget ? ` · ${formatBoxOffice(m.budget) ?? ""}` : ""}
                    </p>
                  </div>
                  <span className="hidden md:block text-sm text-white tabular-nums text-right">
                    {formatBoxOffice(m.revenue) ?? "—"}
                  </span>
                  <span className="hidden md:block text-sm text-white tabular-nums text-right">
                    {formatBoxOffice(m.budget) ?? "—"}
                  </span>
                  <span className="hidden md:block text-sm text-white tabular-nums text-right">
                    {formatROI(m.roi) ?? "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prev/next navigation. Bounds enforced so we don't surface
          links to years that don't exist or that are far in the
          future. */}
      <div className="flex items-center justify-between gap-3">
        {year > MIN_YEAR ? (
          <Link
            href={`/box-office/year/${year - 1}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-sm text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {year - 1}
          </Link>
        ) : <span />}
        {year < MAX_YEAR ? (
          <Link
            href={`/box-office/year/${year + 1}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-sm text-white rounded-lg transition-colors"
          >
            {year + 1} <ArrowRight className="w-4 h-4" />
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
      <p className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-base font-semibold text-white tabular-nums truncate">{value}</p>
      {hint && <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{hint}</p>}
    </div>
  );
}
