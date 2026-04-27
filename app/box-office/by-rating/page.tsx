import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Info } from "lucide-react";
import { getTopGrossingByMpa } from "@/lib/box-office-queries";
import { Leaderboard } from "@/components/box-office/Leaderboard";

export const metadata: Metadata = {
  title: "Box Office by MPA Rating",
  description:
    "Highest grossing films by MPA content rating: G, PG, PG-13, R, and NC-17.",
  alternates: { canonical: "/box-office/by-rating" },
};

export const revalidate = 21600;

const MPA_BUCKETS: Array<{ code: string; subtitle: string }> = [
  { code: "G",     subtitle: "Suitable for all ages" },
  { code: "PG",    subtitle: "Parental guidance suggested" },
  { code: "PG-13", subtitle: "Parents strongly cautioned" },
  { code: "R",     subtitle: "Restricted; under 17 with adult" },
  { code: "NC-17", subtitle: "Adults only" },
];

export default async function BoxOfficeByRatingPage() {
  const results = await Promise.all(MPA_BUCKETS.map((b) => getTopGrossingByMpa(b.code, 10)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office by MPA Rating</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Highest-grossing films within each MPA content rating.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          MPA ratings are sourced from TMDB and reflect the theatrical certificate
          assigned to the US release. Some older films and most foreign releases
          will not appear here because TMDB doesn't carry an MPA cert for them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {MPA_BUCKETS.map((b, idx) => (
          <Leaderboard
            key={b.code}
            icon={ShieldCheck}
            title={`Top ${b.code}-Rated`}
            subtitle={b.subtitle}
            rows={results[idx]}
            metric="revenue"
            viewAllHref={`/box-office/all?mpa=${encodeURIComponent(b.code)}&sort=revenue-desc`}
          />
        ))}
      </div>
    </div>
  );
}
