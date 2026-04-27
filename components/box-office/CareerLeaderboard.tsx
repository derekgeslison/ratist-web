/**
 * Variant of Leaderboard for career-box-office rows. Each row is one
 * celebrity (actor or director) with their lifetime gross + film count
 * rather than a single film. Style matches the Movie leaderboard so
 * the two read as a family on /box-office.
 */
import Link from "next/link";
import Image from "next/image";
import { formatBoxOffice } from "@/lib/box-office";
import type { CareerRow } from "@/lib/box-office-queries";

export interface CareerLeaderboardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rows: CareerRow[];
}

export function CareerLeaderboard({ icon: Icon, title, subtitle, rows }: CareerLeaderboardProps) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)]">
        <Icon className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{subtitle}</p>
        </div>
      </header>
      <ol className="divide-y divide-[var(--border)]">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-xs text-[var(--foreground-muted)] text-center">
            Not enough data yet.
          </li>
        ) : (
          rows.map((row, idx) => (
            <li key={row.tmdbId}>
              <Link
                href={`/celebrities/${row.tmdbId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-sm font-bold text-[var(--foreground-muted)] w-5 text-right tabular-nums shrink-0">
                  {idx + 1}
                </span>
                <div className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden bg-[var(--background)]">
                  {row.profilePath ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${row.profilePath}`}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{row.name}</p>
                  <p className="text-[11px] text-[var(--foreground-muted)]">
                    {row.filmCount} film{row.filmCount === 1 ? "" : "s"}
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
    </section>
  );
}
