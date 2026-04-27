import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Film, Info } from "lucide-react";
import { getFranchiseMovies } from "@/lib/box-office-queries";
import { formatBoxOffice, formatROI } from "@/lib/box-office";

export const revalidate = 21600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const collectionId = parseInt(id, 10);
  if (Number.isNaN(collectionId)) return { title: "Franchise" };
  const data = await getFranchiseMovies(collectionId);
  if (!data.name) return { title: "Franchise" };
  return {
    title: `${data.name} — Box Office`,
    description: `Box office breakdown for the ${data.name} franchise: lifetime gross, budget, and ROI for every entry.`,
    alternates: { canonical: `/box-office/franchises/${collectionId}` },
  };
}

export default async function FranchiseDetailPage({ params }: Props) {
  const { id } = await params;
  const collectionId = parseInt(id, 10);
  if (Number.isNaN(collectionId)) notFound();

  const { name, movies } = await getFranchiseMovies(collectionId);
  if (!name || movies.length === 0) notFound();

  // Totals for the header strip. Skip null revenues so half-tracked
  // franchises still report a meaningful sum (rather than NaN).
  const totalRevenue = movies.reduce((acc, m) => acc + (m.revenue ?? 0), 0);
  const totalBudget = movies.reduce((acc, m) => acc + (m.budget ?? 0), 0);
  const filmsWithRevenue = movies.filter((m) => m.revenue != null).length;
  const filmsWithBudget = movies.filter((m) => m.budget != null).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Film className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{name}</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Franchise lifetime box office.
          {" "}
          <Link href="/box-office/franchises" className="text-[var(--ratist-red)] hover:underline">
            ← Back to franchises
          </Link>
        </p>
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Films tracked" value={String(movies.length)} />
        <Stat
          label="Total revenue"
          value={formatBoxOffice(totalRevenue) ?? "—"}
          hint={filmsWithRevenue < movies.length ? `${filmsWithRevenue} of ${movies.length} reported` : undefined}
        />
        <Stat
          label="Total budget"
          value={formatBoxOffice(totalBudget) ?? "—"}
          hint={filmsWithBudget < movies.length ? `${filmsWithBudget} of ${movies.length} reported` : undefined}
        />
        <Stat
          label="Franchise ROI"
          value={
            totalBudget > 0 && totalRevenue > 0
              ? formatROI(totalRevenue / totalBudget) ?? "—"
              : "—"
          }
          hint="Total revenue ÷ total budget"
        />
      </div>

      {filmsWithRevenue < movies.length || filmsWithBudget < movies.length ? (
        <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
          <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            Some entries are missing revenue or budget in TMDB and are excluded
            from the totals above. Franchise totals are not inflation-adjusted —
            older entries skew lower in absolute dollars.
          </p>
        </div>
      ) : null}

      {/* Per-film table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[3rem_1fr_5rem_8rem_8rem_6rem] gap-3 px-4 py-2 border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          <span></span>
          <span>Title</span>
          <span className="text-right">Year</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">Budget</span>
          <span className="text-right">ROI</span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {movies.map((m) => (
            <li key={m.tmdbId}>
              <Link
                href={`/movies/${m.tmdbId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
              >
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
                    {(m.releaseDate?.slice(0, 4) ?? "—")} · {formatBoxOffice(m.revenue) ?? "—"}
                  </p>
                </div>
                <span className="hidden md:block text-sm text-[var(--foreground-muted)] tabular-nums text-right">
                  {m.releaseDate?.slice(0, 4) ?? "—"}
                </span>
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
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
      <p className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-base font-semibold text-white tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{hint}</p>}
    </div>
  );
}
