"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BarChart3, Film, Clock, TrendingUp, Star, Users, Target, Zap, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import ShareButton from "@/components/ShareButton";

/* ── Types ── */
interface AnalyticsData {
  overview: { totalRated: number; totalSeen: number; totalDated: number; avgRating: number | null; totalRuntime: number; totalHours: number; avgMovieLength: number | null };
  velocity: { month: string; count: number }[];
  genres: { name: string; count: number; avgRating: number | null }[];
  decades: { decade: string; count: number; avgRating: number | null }[];
  directorsTopRated: { name: string; count: number; avgRating: number }[];
  actorsTopRated: { name: string; count: number; avgRating: number }[];
  directorsMostWatched: { name: string; count: number; avgRating: number | null }[];
  actorsMostWatched: { name: string; count: number; avgRating: number | null }[];
  distribution: { score: number; count: number }[];
  ratingTrend: { month: string; avgRating: number; count: number }[];
  contrarianScore: number | null;
  mostControversial: { title: string; userScore: number; communityScore: number; diff: number }[];
  seasonal: { month: string; count: number }[];
  dayOfWeek: { day: string; count: number }[];
  blindSpots: { genre: string; count: number }[];
  categoryAverages: {
    story: { score: number | null; fields: Record<string, number | null> };
    style: { score: number | null; fields: Record<string, number | null> };
    emotive: { score: number | null; fields: Record<string, number | null> };
    acting: { score: number | null; fields: Record<string, number | null> };
    entertainment: { score: number | null; fields: Record<string, number | null> };
  };
}

interface ReportRow { label: string; count: number; avgRating: number | null; totalHours: number }

type Tab = "overview" | "genres" | "people" | "insights" | "habits" | "custom";

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "genres", label: "Genres", icon: Film },
  { key: "people", label: "Directors & Actors", icon: Users },
  { key: "insights", label: "Rating Insights", icon: TrendingUp },
  { key: "habits", label: "Habits", icon: Clock },
  { key: "custom", label: "Custom Report", icon: Target },
];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
      <p className="text-3xl font-bold" style={{ color: color ?? "white" }}>{value}</p>
      <p className="text-xs text-[var(--foreground-muted)] mt-1">{label}</p>
      {sub && <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  // Custom report state
  const [reportGroupBy, setReportGroupBy] = useState("genre");
  const [reportGenre, setReportGenre] = useState("");
  const [reportDecade, setReportDecade] = useState("");
  const [reportMinRating, setReportMinRating] = useState("");
  const [reportMaxRating, setReportMaxRating] = useState("");
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSortBy, setReportSortBy] = useState<"label" | "count" | "avgRating" | "totalHours">("count");
  const [reportSortAsc, setReportSortAsc] = useState(false);

  const getToken = useCallback(async () => user ? user.getIdToken() : null, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (yearFrom) params.set("yearFrom", yearFrom);
      if (yearTo) params.set("yearTo", yearTo);
      const qs = params.toString();
      const res = await fetch(`/api/tools/analytics${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [user, getToken, yearFrom, yearTo]);

  async function runReport() {
    setReportLoading(true);
    const token = await getToken();
    if (!token) return;
    const params = new URLSearchParams({ groupBy: reportGroupBy });
    if (reportGenre) params.set("genre", reportGenre);
    if (reportDecade) params.set("decade", reportDecade);
    if (reportMinRating) params.set("minRating", reportMinRating);
    if (reportMaxRating) params.set("maxRating", reportMaxRating);
    const res = await fetch(`/api/tools/analytics/report?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = await res.json();
      setReportRows(d.rows ?? []);
    }
    setReportLoading(false);
  }

  const sortedReport = [...reportRows].sort((a, b) => {
    if (reportSortBy === "label") {
      return reportSortAsc ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
    }
    const av = reportSortBy === "count" ? a.count : reportSortBy === "avgRating" ? (a.avgRating ?? -1) : a.totalHours;
    const bv = reportSortBy === "count" ? b.count : reportSortBy === "avgRating" ? (b.avgRating ?? -1) : b.totalHours;
    return reportSortAsc ? av - bv : bv - av;
  });

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">
        <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your analytics.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">My Analytics</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-4">Insights into your movie watching and rating habits.</p>

      {/* Global year range filter */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-xs text-[var(--foreground-muted)]">Release year</span>
        <input
          type="number"
          value={yearFrom}
          onChange={(e) => setYearFrom(e.target.value)}
          placeholder="From"
          min={1900} max={2030}
          className="w-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]"
        />
        <span className="text-xs text-[var(--foreground-muted)]">to</span>
        <input
          type="number"
          value={yearTo}
          onChange={(e) => setYearTo(e.target.value)}
          placeholder="To"
          min={1900} max={2030}
          className="w-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]"
        />
        {(yearFrom || yearTo) && (
          <button onClick={() => { setYearFrom(""); setYearTo(""); }} className="text-xs text-[var(--ratist-red)] hover:underline">
            Clear
          </button>
        )}
        {(yearFrom || yearTo) && (
          <span className="text-xs text-[var(--foreground-muted)]">
            Showing {yearFrom || "all"} – {yearTo || "present"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Crunching your data...</p>
      ) : !data ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-2">Not enough data yet.</p>
          <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Start rating movies →</Link>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto pb-px">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>

          {/* Share button for current tab */}
          {user && tab !== "custom" && (
            <div className="flex justify-end mb-4 -mt-2">
              <ShareButton
                label={`Share ${TABS.find((t) => t.key === tab)?.label ?? "Analytics"}`}
                text={`Check out my ${TABS.find((t) => t.key === tab)?.label ?? "analytics"}${yearFrom || yearTo ? ` (${yearFrom}${yearTo ? `–${yearTo}` : "+"})` : ""} on The Ratist!`}
                url={`${typeof window !== "undefined" ? window.location.origin : "https://theratist.com"}/tools/analytics`}
                cardImageUrl={`/api/og/analytics?userId=${encodeURIComponent(user.uid)}&tab=${tab}${yearFrom ? `&yearFrom=${yearFrom}` : ""}${yearTo ? `&yearTo=${yearTo}` : ""}`}
              />
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Movies Rated" value={String(data.overview.totalRated)} />
                <StatCard label="Movies Seen" value={String(data.overview.totalSeen)} />
                <StatCard label="Average Rating" value={data.overview.avgRating?.toFixed(1) ?? "—"} color={data.overview.avgRating ? scoreColor(data.overview.avgRating) : undefined} />
                <StatCard label="Total Watch Time" value={`${data.overview.totalHours}h`} sub={data.overview.avgMovieLength ? `~${data.overview.avgMovieLength} min avg` : undefined} />
              </div>

              {/* Velocity chart */}
              {data.velocity.length > 1 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">Movies per Month</h3>
                  {(() => {
                    const last24 = data.velocity.slice(-24);
                    const maxCount = Math.max(...last24.map((x) => x.count), 1);
                    const barHeight = 120;
                    return (
                      <>
                        <div className="flex items-end gap-1" style={{ height: barHeight + 16 }}>
                          {last24.map((v) => {
                            const h = Math.round((v.count / maxCount) * barHeight);
                            return (
                              <div key={v.month} className="flex-1 flex flex-col items-center justify-end group relative">
                                <div className="w-full bg-[var(--ratist-red)]/80 rounded-t" style={{ height: h, minHeight: v.count > 0 ? 4 : 0 }} />
                                <div className="absolute -top-6 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                                  {v.month}: {v.count}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[9px] text-[var(--foreground-muted)] mt-1">
                          <span>{last24[0]?.month}</span>
                          <span>{last24[last24.length - 1]?.month}</span>
                        </div>
                      </>
                    );
                  })()}
                </section>
              )}

              {/* Decades */}
              {data.decades.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">By Decade</h3>
                  <div className="space-y-2">
                    {data.decades.map((d) => (
                      <div key={d.decade} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--foreground-muted)] w-16 shrink-0">{d.decade}</span>
                        <Bar value={d.count} max={data.decades[0]?.count ?? 1} color={d.avgRating ? scoreColor(d.avgRating) : "#555"} />
                        <span className="text-xs text-white w-8 text-right">{d.count}</span>
                        {d.avgRating && <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(d.avgRating) }}>{d.avgRating}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Top genres quick view */}
              {data.genres.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">Top Genres</h3>
                  <div className="space-y-2">
                    {data.genres.slice(0, 8).map((g) => (
                      <div key={g.name} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--foreground-muted)] w-28 shrink-0 truncate">{g.name}</span>
                        <Bar value={g.count} max={data.genres[0].count} color={g.avgRating ? scoreColor(g.avgRating) : "#555"} />
                        <span className="text-xs text-white w-6 text-right">{g.count}</span>
                        {g.avgRating && <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(g.avgRating) }}>{g.avgRating}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── GENRES ── */}
          {tab === "genres" && (() => {
            const totalGenreMovies = data.genres.reduce((s, g) => s + g.count, 0);
            const genresWithRatings = data.genres.filter((g) => g.avgRating != null);
            const highestRatedGenre = genresWithRatings.length > 0 ? genresWithRatings.reduce((best, g) => (g.avgRating! > (best.avgRating ?? 0) ? g : best)) : null;
            const lowestRatedGenre = genresWithRatings.length > 0 ? genresWithRatings.reduce((worst, g) => (g.avgRating! < (worst.avgRating ?? 10) ? g : worst)) : null;
            return (
            <div className="space-y-8">
              {/* Genre insight cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Genres Explored" value={String(data.genres.length)} sub={`of ${data.genres.length + data.blindSpots.length} total`} />
                <StatCard label="Total Genre Tags" value={String(totalGenreMovies)} sub="movies × genres" />
                {highestRatedGenre && (
                  <StatCard label="Highest Rated Genre" value={highestRatedGenre.name} sub={`avg ${highestRatedGenre.avgRating}`} color={scoreColor(highestRatedGenre.avgRating!)} />
                )}
                {lowestRatedGenre && (
                  <StatCard label="Lowest Rated Genre" value={lowestRatedGenre.name} sub={`avg ${lowestRatedGenre.avgRating}`} color={scoreColor(lowestRatedGenre.avgRating!)} />
                )}
              </div>

              {/* Full genre breakdown */}
              <section>
                <h3 className="text-sm font-semibold text-white mb-3">Genre Breakdown</h3>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">All seen movies by genre, with average rating where available.</p>
                <div className="space-y-2">
                  {data.genres.map((g) => (
                    <div key={g.name} className="flex items-center gap-3">
                      <span className="text-xs text-[var(--foreground-muted)] w-32 shrink-0 truncate">{g.name}</span>
                      <Bar value={g.count} max={data.genres[0]?.count ?? 1} color={g.avgRating ? scoreColor(g.avgRating) : "#555"} />
                      <span className="text-xs text-white w-8 text-right">{g.count}</span>
                      {g.avgRating && <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(g.avgRating) }}>{g.avgRating}</span>}
                    </div>
                  ))}
                </div>
              </section>

              {/* Blind spots */}
              {data.blindSpots.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-2">Blind Spots</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Genres you haven&apos;t explored much yet.</p>
                  <div className="flex flex-wrap gap-2">
                    {data.blindSpots.map((b) => (
                      <span key={b.genre} className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1 text-[var(--foreground-muted)]">
                        {b.genre} ({b.count})
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
            );
          })()}

          {/* ── DIRECTORS & ACTORS ── */}
          {tab === "people" && (
            <div className="space-y-10">
              {/* Most Watched */}
              <div className="grid md:grid-cols-2 gap-8">
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Film className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> Most Watched Directors
                  </h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Directors whose films you&apos;ve seen the most.</p>
                  {data.directorsMostWatched.length === 0 ? (
                    <p className="text-xs text-[var(--foreground-muted)]">Watch more movies to see director insights.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.directorsMostWatched.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-[var(--foreground-muted)] w-5 text-right">{i + 1}</span>
                          <span className="text-sm text-white flex-1 truncate">{d.name}</span>
                          <span className="text-xs font-semibold text-white">{d.count} films</span>
                          {d.avgRating != null && <span className="text-xs w-8 text-right" style={{ color: scoreColor(d.avgRating) }}>{d.avgRating}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Film className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> Most Watched Actors
                  </h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Actors you&apos;ve seen the most across all movies.</p>
                  {data.actorsMostWatched.length === 0 ? (
                    <p className="text-xs text-[var(--foreground-muted)]">Watch more movies to see actor insights.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.actorsMostWatched.map((a, i) => (
                        <div key={a.name} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-[var(--foreground-muted)] w-5 text-right">{i + 1}</span>
                          <span className="text-sm text-white flex-1 truncate">{a.name}</span>
                          <span className="text-xs font-semibold text-white">{a.count} films</span>
                          {a.avgRating != null && <span className="text-xs w-8 text-right" style={{ color: scoreColor(a.avgRating) }}>{a.avgRating}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Top Rated */}
              <div className="grid md:grid-cols-2 gap-8">
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> Highest Rated Directors
                  </h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Directors with 2+ rated movies, sorted by your average rating.</p>
                  {data.directorsTopRated.length === 0 ? (
                    <p className="text-xs text-[var(--foreground-muted)]">Rate more movies to see rating-based director insights.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.directorsTopRated.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-[var(--foreground-muted)] w-5 text-right">{i + 1}</span>
                          <span className="text-sm text-white flex-1 truncate">{d.name}</span>
                          <span className="text-xs text-[var(--foreground-muted)]">{d.count} films</span>
                          <span className="text-sm font-bold w-8 text-right" style={{ color: scoreColor(d.avgRating) }}>{d.avgRating}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> Highest Rated Actors
                  </h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Actors with 2+ rated movies, sorted by your average rating.</p>
                  {data.actorsTopRated.length === 0 ? (
                    <p className="text-xs text-[var(--foreground-muted)]">Rate more movies to see rating-based actor insights.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.actorsTopRated.map((a, i) => (
                        <div key={a.name} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-[var(--foreground-muted)] w-5 text-right">{i + 1}</span>
                          <span className="text-sm text-white flex-1 truncate">{a.name}</span>
                          <span className="text-xs text-[var(--foreground-muted)]">{a.count} films</span>
                          <span className="text-sm font-bold w-8 text-right" style={{ color: scoreColor(a.avgRating) }}>{a.avgRating}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ── RATING INSIGHTS ── */}
          {tab === "insights" && (
            <div className="space-y-8">
              {/* Distribution */}
              <section>
                <h3 className="text-sm font-semibold text-white mb-3">Rating Distribution</h3>
                {(() => {
                  const maxCount = Math.max(...data.distribution.map((x) => x.count), 1);
                  const barHeight = 112; // px
                  return (
                    <div className="flex items-end gap-1" style={{ height: barHeight + 28 }}>
                      {data.distribution.map((d) => {
                        const h = maxCount > 0 ? Math.round((d.count / maxCount) * barHeight) : 0;
                        return (
                          <div key={d.score} className="flex-1 flex flex-col items-center justify-end">
                            <span className="text-[9px] text-[var(--foreground-muted)] mb-1">{d.count > 0 ? d.count : ""}</span>
                            <div className="w-full rounded-t" style={{ height: h, minHeight: d.count > 0 ? 4 : 0, backgroundColor: scoreColor(d.score) }} />
                            <span className="text-[9px] text-[var(--foreground-muted)] mt-1">{d.score}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              {/* Category & Field Averages */}
              {data.categoryAverages && (() => {
                const CATS = [
                  { key: "story", label: "Story", fieldLabels: { plot: "Plot", premiseOriginality: "Premise / Originality", storytelling: "Storytelling", characterDev: "Character Development", pacingClimax: "Pacing / Climax" } },
                  { key: "style", label: "Production & Style", fieldLabels: { cinematography: "Cinematography", locationCost: "Location & Costuming", realism: "Realism / Believability", artisticEffect: "Artistic Effect", visualEffects: "Visual Effects", musicSound: "Music & Sound" } },
                  { key: "emotive", label: "Emotive Effect", fieldLabels: { overallEmotion: "Overall Emotion", relatability: "Relatability", meaning: "Meaning / Message", movingness: "Movingness" } },
                  { key: "acting", label: "Acting & Casting", fieldLabels: { casting: "Casting & Subjects", actingQuality: "Performance Quality", dialogueScripting: "Dialogue & Writing", blockingChoreo: "Blocking & Choreography" } },
                  { key: "entertainment", label: "Pure Entertainment", fieldLabels: { appeal: "Appeal", superficialAllure: "Superficial Allure", choreography: "Choreography" } },
                ];
                const catData = data.categoryAverages as Record<string, { score: number | null; fields: Record<string, number | null> }>;
                const hasCatData = CATS.some((c) => catData[c.key]?.score != null);
                if (!hasCatData) return null;
                return (
                  <section>
                    <h3 className="text-sm font-semibold text-white mb-3">Your Average Ratings by Category</h3>
                    <p className="text-xs text-[var(--foreground-muted)] mb-3">How you rate across each scoring category on average. Click to expand.</p>
                    <div className="space-y-2">
                      {CATS.map((cat) => {
                        const cd = catData[cat.key];
                        if (!cd?.score) return null;
                        return (
                          <details key={cat.key} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors">
                              <span className="text-sm text-white font-medium">{cat.label}</span>
                              <span className="text-sm font-bold" style={{ color: scoreColor(cd.score) }}>{cd.score.toFixed(1)}</span>
                            </summary>
                            <div className="px-4 pb-3 space-y-2 border-t border-[var(--border)]">
                              {Object.entries(cat.fieldLabels).map(([fieldKey, fieldLabel]) => {
                                const val = cd.fields[fieldKey];
                                if (val == null) return null;
                                return (
                                  <div key={fieldKey} className="flex items-center gap-3 pt-1.5">
                                    <span className="text-xs text-[var(--foreground-muted)] flex-1">{fieldLabel}</span>
                                    <Bar value={val} max={10} color={scoreColor(val)} />
                                    <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(val) }}>{val.toFixed(1)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Rating trend */}
              {data.ratingTrend.length > 1 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">Rating Trend Over Time</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Your average rating per month you rated movies.</p>
                  <div className="space-y-1">
                    {data.ratingTrend.slice(-12).map((t) => (
                      <div key={t.month} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--foreground-muted)] w-16 shrink-0">{t.month}</span>
                        <Bar value={t.avgRating} max={10} color={scoreColor(t.avgRating)} />
                        <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(t.avgRating) }}>{t.avgRating}</span>
                        <span className="text-[10px] text-[var(--foreground-muted)] w-10">({t.count})</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Contrarian score */}
              {data.contrarianScore != null && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-2">Contrarian Score</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">
                    Your average deviation from community ratings. Higher = more unique taste.
                  </p>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-black text-white">{data.contrarianScore}</span>
                    <span className="text-xs text-[var(--foreground-muted)]">
                      {data.contrarianScore < 0.8 ? "You mostly agree with the crowd" :
                       data.contrarianScore < 1.5 ? "Balanced — independent but not contrarian" :
                       data.contrarianScore < 2.5 ? "You have unique taste" :
                       "You&apos;re a true contrarian"}
                    </span>
                  </div>
                </section>
              )}

              {/* Most controversial picks */}
              {data.mostControversial.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">Your Most Controversial Takes</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Movies where your rating differs most from the community.</p>
                  <div className="space-y-1.5">
                    {data.mostControversial.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5">
                        <span className="text-sm text-white flex-1 truncate">{m.title}</span>
                        <span className="text-xs">You: <span className="font-bold" style={{ color: scoreColor(m.userScore) }}>{m.userScore.toFixed(1)}</span></span>
                        <span className="text-xs">Avg: <span className="font-bold" style={{ color: scoreColor(m.communityScore) }}>{m.communityScore.toFixed(1)}</span></span>
                        <span className={`text-xs font-bold ${m.diff > 0 ? "text-green-400" : "text-red-400"}`}>
                          {m.diff > 0 ? "+" : ""}{m.diff}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── HABITS ── */}
          {tab === "habits" && (
            <div className="space-y-8">
              {/* Seasonal patterns */}
              <section>
                <h3 className="text-sm font-semibold text-white mb-3">When You Watch</h3>
                <p className="text-xs text-[var(--foreground-muted)] mb-3">Movies watched per calendar month (all years combined, only dated entries).</p>
                {(() => {
                  const maxCount = Math.max(...data.seasonal.map((x) => x.count), 1);
                  const barHeight = 112;
                  return (
                    <div className="flex items-end gap-1" style={{ height: barHeight + 28 }}>
                      {data.seasonal.map((s) => {
                        const h = Math.round((s.count / maxCount) * barHeight);
                        return (
                          <div key={s.month} className="flex-1 flex flex-col items-center justify-end">
                            <span className="text-[9px] text-[var(--foreground-muted)] mb-1">{s.count > 0 ? s.count : ""}</span>
                            <div className="w-full bg-blue-500/70 rounded-t" style={{ height: h, minHeight: s.count > 0 ? 4 : 0 }} />
                            <span className="text-[9px] text-[var(--foreground-muted)] mt-1">{s.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              {/* Day of week patterns */}
              {data.dayOfWeek && (
                <section>
                  <h3 className="text-sm font-semibold text-white mb-3">Day of the Week</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Which days you watch movies most (only dated entries).</p>
                  {(() => {
                    const maxDay = Math.max(...data.dayOfWeek.map((x) => x.count), 1);
                    const barHeight = 112;
                    return (
                      <div className="flex items-end gap-2" style={{ height: barHeight + 28 }}>
                        {data.dayOfWeek.map((d) => {
                          const h = Math.round((d.count / maxDay) * barHeight);
                          return (
                            <div key={d.day} className="flex-1 flex flex-col items-center justify-end">
                              <span className="text-[9px] text-[var(--foreground-muted)] mb-1">{d.count > 0 ? d.count : ""}</span>
                              <div className="w-full bg-purple-500/70 rounded-t" style={{ height: h, minHeight: d.count > 0 ? 4 : 0 }} />
                              <span className="text-[10px] text-[var(--foreground-muted)] mt-1">{d.day}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>
              )}

              {/* Watch time stats */}
              <section>
                <h3 className="text-sm font-semibold text-white mb-3">Watch Time</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatCard label="Total Hours" value={`${data.overview.totalHours}`} sub={`${Math.round(data.overview.totalHours / 24)} full days`} />
                  <StatCard label="Avg Movie Length" value={data.overview.avgMovieLength ? `${data.overview.avgMovieLength}m` : "—"} />
                  <StatCard label="Seen-to-Rated Ratio" value={data.overview.totalRated > 0 ? `${Math.round((data.overview.totalRated / data.overview.totalSeen) * 100)}%` : "—"} sub="of seen movies rated" />
                </div>
              </section>
            </div>
          )}

          {/* ── CUSTOM REPORT ── */}
          {tab === "custom" && (
            <div className="space-y-6">
              <p className="text-sm text-[var(--foreground-muted)]">Build a custom breakdown of your movie data.</p>

              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Group by</label>
                  <select value={reportGroupBy} onChange={(e) => setReportGroupBy(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]">
                    <option value="genre">Genre</option>
                    <option value="decade">Decade</option>
                    <option value="year">Release Year</option>
                    <option value="director">Director</option>
                    <option value="actor">Actor</option>
                  </select>
                </div>

                {data.genres.length > 0 && (
                  <div>
                    <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Genre filter</label>
                    <select value={reportGenre} onChange={(e) => setReportGenre(e.target.value)}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="">All genres</option>
                      {data.genres.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                  </div>
                )}

                {data.decades.length > 0 && (
                  <div>
                    <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Decade filter</label>
                    <select value={reportDecade} onChange={(e) => setReportDecade(e.target.value)}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="">All decades</option>
                      {data.decades.map((d) => <option key={d.decade} value={d.decade}>{d.decade}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Min rating</label>
                  <input type="number" value={reportMinRating} onChange={(e) => setReportMinRating(e.target.value)} placeholder="0" min={0} max={10} step={0.5}
                    className="w-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-sm text-white focus:outline-none" />
                </div>

                <div>
                  <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Max rating</label>
                  <input type="number" value={reportMaxRating} onChange={(e) => setReportMaxRating(e.target.value)} placeholder="10" min={0} max={10} step={0.5}
                    className="w-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-sm text-white focus:outline-none" />
                </div>

                <button onClick={runReport} disabled={reportLoading}
                  className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                  {reportLoading ? "Running..." : "Run Report"}
                </button>
              </div>

              {/* Results */}
              {reportRows.length > 0 && (() => {
                const groupLabel = reportGroupBy === "genre" ? "Genre" : reportGroupBy === "decade" ? "Decade" : reportGroupBy === "year" ? "Year" : reportGroupBy === "director" ? "Director" : "Actor";
                function sortHeader(label: string, key: "label" | "count" | "avgRating" | "totalHours", align: string) {
                  const active = reportSortBy === key;
                  return (
                    <th className={`${align} px-4 py-2.5 font-medium cursor-pointer select-none hover:text-white transition-colors`}
                      onClick={() => { if (active) setReportSortAsc(!reportSortAsc); else { setReportSortBy(key as any); setReportSortAsc(key === "label"); } }}>
                      {label} {active ? (reportSortAsc ? "↑" : "↓") : ""}
                    </th>
                  );
                }
                return (
                <div>
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--surface)] text-[var(--foreground-muted)] text-xs">
                          {sortHeader(groupLabel, "label", "text-left")}
                          {sortHeader("Movies", "count", "text-right")}
                          {sortHeader("Avg Rating", "avgRating", "text-right")}
                          {sortHeader("Hours", "totalHours", "text-right")}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]/20">
                        {sortedReport.map((row) => (
                          <tr key={row.label} className="hover:bg-[var(--surface)]/50">
                            <td className="px-4 py-2 text-white">{row.label}</td>
                            <td className="px-4 py-2 text-right text-[var(--foreground-muted)]">{row.count}</td>
                            <td className="px-4 py-2 text-right font-bold" style={{ color: row.avgRating ? scoreColor(row.avgRating) : "#555" }}>
                              {row.avgRating?.toFixed(1) ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-[var(--foreground-muted)]">{row.totalHours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mt-2">{sortedReport.length} results</p>
                </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
