import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Building2, Info } from "lucide-react";
import { getTopStudios } from "@/lib/box-office-queries";
import { formatBoxOffice } from "@/lib/box-office";

export const metadata: Metadata = {
  title: "Top Grossing Studios",
  description:
    "Highest-grossing production studios by total lifetime box office across every credited film.",
  alternates: { canonical: "/box-office/studios" },
};

export const revalidate = 21600;

export default async function BoxOfficeStudiosPage() {
  const rows = await getTopStudios(100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Grossing Studios</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Lifetime box office summed across every film a studio is credited on.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Films often credit multiple production companies — each studio gets
          full credit for the film's lifetime gross. (TMDB doesn't carry
          per-studio revenue splits and most public sources aggregate the
          same way.) Studios with fewer than 3 tracked films are excluded.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <ol className="divide-y divide-[var(--border)]">
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
              Studio data is still syncing into the catalog. Check back after
              the backfill completes.
            </li>
          ) : (
            rows.map((row, idx) => (
              <li key={row.studioId}>
                <Link
                  href={`/box-office/studios/${row.studioId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-7 text-right tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-10 h-10 shrink-0 rounded bg-[var(--background)] flex items-center justify-center overflow-hidden">
                    {row.logoPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${row.logoPath}`}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <Building2 className="w-4 h-4 text-[var(--foreground-muted)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{row.name}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)]">
                      {row.filmCount} films{row.originCountry ? ` · ${row.originCountry}` : ""}
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
