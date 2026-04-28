import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Building2, Info } from "lucide-react";
import { getStudioMovies } from "@/lib/box-office-queries";
import { formatBoxOffice, formatROI } from "@/lib/box-office";

export const revalidate = 21600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const studioId = parseInt(id, 10);
  if (Number.isNaN(studioId)) return { title: "Studio" };
  const data = await getStudioMovies(studioId);
  if (!data.studio) return { title: "Studio" };
  return {
    title: `${data.studio.name} — Box Office`,
    description: `Box office breakdown for ${data.studio.name}: lifetime gross, budget, and ROI for every credited film.`,
    alternates: { canonical: `/box-office/studios/${studioId}` },
  };
}

export default async function StudioDetailPage({ params }: Props) {
  const { id } = await params;
  const studioId = parseInt(id, 10);
  if (Number.isNaN(studioId)) notFound();

  const { studio, movies } = await getStudioMovies(studioId);
  if (!studio || movies.length === 0) notFound();

  // Totals — same approach as franchise detail. revenue and budget
  // are skipped where null so a partial dataset still produces a
  // meaningful headline number.
  const totalRevenue = movies.reduce((acc, m) => acc + (m.revenue ?? 0), 0);
  const totalBudget = movies.reduce((acc, m) => acc + (m.budget ?? 0), 0);
  const filmsWithRevenue = movies.filter((m) => m.revenue != null).length;
  const filmsWithBudget = movies.filter((m) => m.budget != null).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {studio.logoPath ? (
            <div className="relative w-10 h-10 rounded bg-[var(--background)] flex items-center justify-center overflow-hidden">
              <Image
                src={`https://image.tmdb.org/t/p/w92${studio.logoPath}`}
                alt=""
                fill
                sizes="40px"
                className="object-contain p-1"
              />
            </div>
          ) : (
            <Building2 className="w-6 h-6 text-[var(--ratist-red)]" />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{studio.name}</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Studio lifetime box office.
          {studio.originCountry ? ` Based in ${studio.originCountry}.` : ""}
          {" "}
          <Link href="/box-office/studios" className="text-[var(--ratist-red)] hover:underline">
            ← Back to studios
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
          label="Studio ROI"
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
            Some films are missing revenue or budget in TMDB and are excluded
            from the totals above. Co-produced films contribute fully to each
            credited studio's totals.
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
                className="flex md:grid md:grid-cols-[3rem_1fr_5rem_8rem_8rem_6rem] items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
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
