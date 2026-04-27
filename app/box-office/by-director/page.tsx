import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Clapperboard, Info } from "lucide-react";
import { getTopCelebrityCareers } from "@/lib/box-office-queries";
import { formatBoxOffice } from "@/lib/box-office";

export const metadata: Metadata = {
  title: "Top Grossing Directors",
  description:
    "Highest-grossing directors by lifetime career box office. Sums every directed film.",
  alternates: { canonical: "/box-office/by-director" },
};

export const revalidate = 21600;

export default async function BoxOfficeByDirectorPage() {
  const rows = await getTopCelebrityCareers("director", 100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Clapperboard className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Grossing Directors</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Lifetime career box office across every directed film.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Career totals sum lifetime worldwide gross of every film credited
          to a director (TMDB job = "Director"). Co-directed films count
          fully toward each director's total. The list excludes directors
          with fewer than 3 tracked films.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <ol className="divide-y divide-[var(--border)]">
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
              Not enough data yet.
            </li>
          ) : (
            rows.map((row, idx) => (
              <li key={row.tmdbId}>
                <Link
                  href={`/celebrities/${row.tmdbId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-7 text-right tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-[var(--background)]">
                    {row.profilePath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${row.profilePath}`}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{row.name}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)]">
                      {row.filmCount} films directed
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0">
                    {formatBoxOffice(row.totalRevenue) ?? "—"}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
