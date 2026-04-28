import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Info } from "lucide-react";
import { getTopGrossing } from "@/lib/box-office-queries";
import { Leaderboard } from "@/components/box-office/Leaderboard";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";

export const metadata: Metadata = {
  title: "Box Office by Decade",
  description:
    "Highest grossing movies of the 1980s, 1990s, 2000s, 2010s, and 2020s. See how box-office champions changed across eras.",
  alternates: { canonical: "/box-office/by-decade" },
  openGraph: {
    title: "Box Office by Decade",
    description: "Top-grossing films of every decade since the 1970s.",
    images: [{ url: "/api/og/box-office?page=branded&title=Box+Office+by+Decade&subtitle=Top+grossing+across+every+era", width: 800, height: 520 }],
  },
};

// Same caching cadence as the landing page — the underlying data
// only changes on TMDB resync, which we trigger on detail-page view.
export const revalidate = 21600;

const DECADES: Array<{ key: string; label: string; from: string; to: string }> = [
  { key: "2020s", label: "2020s",   from: "2020", to: "2029" },
  { key: "2010s", label: "2010s",   from: "2010", to: "2019" },
  { key: "2000s", label: "2000s",   from: "2000", to: "2009" },
  { key: "1990s", label: "1990s",   from: "1990", to: "1999" },
  { key: "1980s", label: "1980s",   from: "1980", to: "1989" },
  { key: "1970s", label: "1970s",   from: "1970", to: "1979" },
];

export default async function BoxOfficeByDecadePage() {
  // Run all decade queries in parallel — they're independent.
  const results = await Promise.all(
    DECADES.map((d) => getTopGrossing(10, d.from, d.to)),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-[var(--ratist-red)]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Grossing by Decade</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Highest-grossing films of each decade.
            {" "}
            <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
              ← Back to leaderboards
            </Link>
          </p>
        </div>
        <BoxOfficeShare
          path="/box-office/by-decade"
          ogPath="/api/og/box-office?page=branded&title=Box+Office+by+Decade&subtitle=Top+grossing+across+every+era"
          shareText="Top Grossing Movies by Decade — The Ratist"
        />
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Pre-1980 box-office data in TMDB is sparse — the further back you go,
          the more gaps you'll see. Numbers are <strong className="text-white/80">unadjusted lifetime grosses</strong>, not
          inflation-adjusted, so the 80s/90s lists naturally show smaller dollar
          figures than later decades.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {DECADES.map((d, idx) => (
          <Leaderboard
            key={d.key}
            icon={Calendar}
            title={`Top of the ${d.label}`}
            subtitle={`${d.from}–${d.to} releases`}
            rows={results[idx]}
            metric="revenue"
            viewAllHref={`/box-office/all?releaseFrom=${d.from}-01-01&releaseTo=${d.to}-12-31&sort=revenue-desc`}
          />
        ))}
      </div>
    </div>
  );
}
