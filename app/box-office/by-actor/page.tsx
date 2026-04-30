import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Users, Info } from "lucide-react";
import { getTopCelebrityCareers } from "@/lib/box-office-queries";
import { formatBoxOffice } from "@/lib/box-office";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";

export const metadata: Metadata = {
  title: "Top Grossing Actors",
  description:
    "Highest-grossing actors by lifetime career box office. Sums every credited role across all of an actor's films.",
  alternates: { canonical: "/box-office/by-actor" },
  openGraph: {
    title: "Top Grossing Actors of All Time",
    description: "Lifetime career box office across every credited role.",
    images: [{ url: "/api/og/box-office?page=topActors", width: 800, height: 520 }],
  },
};

export const revalidate = 21600;

export default async function BoxOfficeByActorPage() {
  const rows = await getTopCelebrityCareers("actor", 100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-[var(--ratist-red)]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Grossing Actors</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Lifetime career box office across every credited role.
            {" "}
            <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
              ← Back to leaderboards
            </Link>
          </p>
        </div>
        <BoxOfficeShare
          path="/box-office/by-actor"
          ogPath="/api/og/box-office?page=topActors"
          shareText="Top Grossing Actors of All Time — The Ratist"
        />
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Career totals sum lifetime worldwide gross of every film an actor is
          credited on, regardless of role size. The list excludes one-hit wonders
          (minimum 3 credited films). Cameos count as full credits — Stan Lee
          would dominate this list otherwise.
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
                      {row.filmCount} films credited
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
