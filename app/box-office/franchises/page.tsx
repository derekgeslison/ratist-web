import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Film, Info } from "lucide-react";
import { getTopFranchises } from "@/lib/box-office-queries";
import { formatBoxOffice } from "@/lib/box-office";

export const metadata: Metadata = {
  title: "Top Grossing Franchises",
  description:
    "Highest-grossing movie franchises by total lifetime box office across every entry in the series.",
  alternates: { canonical: "/box-office/franchises" },
};

export const revalidate = 21600;

export default async function BoxOfficeFranchisesPage() {
  const rows = await getTopFranchises(100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Film className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Grossing Franchises</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Lifetime box office summed across every film in the franchise.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Franchises are sourced from TMDB's <code className="text-white/80">belongs_to_collection</code> field
          and exclude collections with only one tracked entry. Crossover entries
          (e.g. Avengers films within the wider MCU collection) follow TMDB's
          assignment, which may differ from your own grouping.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <ol className="divide-y divide-[var(--border)]">
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
              Not enough franchise data yet — TMDB collection metadata is still
              syncing into the catalog.
            </li>
          ) : (
            rows.map((row, idx) => (
              <li key={row.collectionId}>
                <Link
                  href={`/box-office/franchises/${row.collectionId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-7 text-right tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--background)]">
                    {row.topPosterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${row.topPosterPath}`}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{row.name}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)]">
                      {row.filmCount} films
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
