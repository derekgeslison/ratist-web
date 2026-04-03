import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#ccc", fontSize: 13, width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", flex: 1, height: 18, background: "#222", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color ?? "#CC0033", borderRadius: 4 }} />
      </div>
      <span style={{ color: "#888", fontSize: 13, width: 32, textAlign: "right" as const, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const tab = searchParams.get("tab") ?? "overview";

  try {
    const logoSrc = getLogoBase64();
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const yearFrom = searchParams.get("yearFrom") ?? "";
    const yearTo = searchParams.get("yearTo") ?? "";
    const yearLabel = yearFrom && yearTo ? `${yearFrom}–${yearTo}` : yearFrom ? `From ${yearFrom}` : yearTo ? `Through ${yearTo}` : "All Time";

    // Core stats
    const [ratingCount, seenCount, avgRating] = await Promise.all([
      prisma.movieRating.count({ where: { userId: user.id } }),
      prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      prisma.movieRating.aggregate({
        where: { userId: user.id },
        _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      }),
    ]);
    const avg = avgRating._avg;

    let tabTitle = "My Analytics";
    let chartContent: React.ReactNode = null;

    // ── Overview: Decade breakdown ──
    if (tab === "overview") {
      tabTitle = "Movie Analytics";
      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { releaseDate: true } } },
      });
      const decadeCounts = new Map<string, number>();
      for (const s of seenMovies) {
        const year = s.movie.releaseDate?.slice(0, 4);
        if (!year) continue;
        const decade = `${year.slice(0, 3)}0s`;
        decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
      }
      const decades = [...decadeCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([decade, count]) => ({ decade, count }));
      const maxD = Math.max(...decades.map((d) => d.count), 1);
      const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f43f5e"];
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Movies by Decade</span>
          {decades.slice(-8).map((d, i) => (
            <Bar key={d.decade} label={d.decade} value={d.count} max={maxD} color={colors[i % colors.length]} />
          ))}
        </div>
      );
    }

    // ── Genres: Genre bar chart ──
    else if (tab === "genres") {
      tabTitle = "Genre Breakdown";
      const genres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 8,
      });
      const genreNames = await prisma.genre.findMany({ where: { id: { in: genres.map((g) => g.genreId) } } });
      const nameMap = new Map(genreNames.map((g) => [g.id, g.name]));
      const maxG = Math.max(...genres.map((g) => g._count.genreId), 1);
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {genres.map((g) => (
            <Bar key={g.genreId} label={nameMap.get(g.genreId) ?? "?"} value={g._count.genreId} max={maxG} />
          ))}
        </div>
      );
    }

    // ── Directors & Actors: Top bars ──
    else if (tab === "people") {
      tabTitle = "Directors & Actors";
      const highRated = await prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { gte: 6 } },
        select: { movieId: true },
        take: 200,
      });
      const movieIds = highRated.map((r) => r.movieId);

      let dirBars: React.ReactNode = null;
      let actorBars: React.ReactNode = null;

      if (movieIds.length > 0) {
        // Directors
        const dirCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "crew", job: "Director" },
          select: { celebrity: { select: { name: true } } },
        });
        const dirCounts = new Map<string, number>();
        for (const dc of dirCredits) {
          dirCounts.set(dc.celebrity.name, (dirCounts.get(dc.celebrity.name) ?? 0) + 1);
        }
        const topDirs = [...dirCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 4);
        const maxDir = Math.max(...topDirs.map(([, c]) => c), 1);

        // Actors
        const actCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "cast", castOrder: { lte: 5 } },
          select: { celebrity: { select: { name: true } } },
        });
        const actCounts = new Map<string, number>();
        for (const ac of actCredits) {
          actCounts.set(ac.celebrity.name, (actCounts.get(ac.celebrity.name) ?? 0) + 1);
        }
        const topActs = [...actCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 4);
        const maxAct = Math.max(...topActs.map(([, c]) => c), 1);

        dirBars = (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Top Directors</span>
            {topDirs.map(([name, count]) => (
              <Bar key={name} label={name.length > 16 ? name.slice(0, 15) + "…" : name} value={count} max={maxDir} color="#3b82f6" />
            ))}
          </div>
        );
        actorBars = (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Top Actors</span>
            {topActs.map(([name, count]) => (
              <Bar key={name} label={name.length > 16 ? name.slice(0, 15) + "…" : name} value={count} max={maxAct} color="#eab308" />
            ))}
          </div>
        );
      }

      chartContent = (
        <div style={{ display: "flex", gap: 24 }}>
          {dirBars}
          {actorBars}
        </div>
      );
    }

    // ── Rating Insights: Category bars + contrarian + controversial ──
    else if (tab === "insights") {
      tabTitle = "Rating Insights";
      const cats = [
        { label: "Story", score: avg.storyScore },
        { label: "Style", score: avg.styleScore },
        { label: "Emotion", score: avg.emotiveScore },
        { label: "Acting", score: avg.actingScore },
        { label: "Entertainment", score: avg.entertainScore },
      ];

      // Contrarian score
      const userRatings = await prisma.movieRating.findMany({
        where: { userId: user.id },
        select: { movieId: true, ratistRating: true },
        take: 200,
      });
      const movieIdsForContrarian = userRatings.filter((r) => r.ratistRating != null).map((r) => r.movieId);
      let contrarianScore: number | null = null;
      let controversial: { title: string; userScore: number; communityScore: number } | null = null;

      if (movieIdsForContrarian.length > 0) {
        const communityAvgs = await prisma.movieRating.groupBy({
          by: ["movieId"],
          where: { movieId: { in: movieIdsForContrarian } },
          _avg: { ratistRating: true },
          _count: { id: true },
        });
        const communityMap = new Map(communityAvgs.filter((c) => c._count.id >= 2).map((c) => [c.movieId, c._avg.ratistRating]));

        const diffs: number[] = [];
        let maxDiff = 0;
        let maxDiffMovie: { movieId: string; userScore: number; communityScore: number } | null = null;

        for (const r of userRatings) {
          const comm = communityMap.get(r.movieId);
          if (comm != null && r.ratistRating != null) {
            const d = Math.abs(r.ratistRating - comm);
            diffs.push(d);
            if (d > maxDiff) {
              maxDiff = d;
              maxDiffMovie = { movieId: r.movieId, userScore: r.ratistRating, communityScore: comm };
            }
          }
        }
        if (diffs.length > 0) {
          contrarianScore = Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10);
        }
        if (maxDiffMovie) {
          const movie = await prisma.movie.findUnique({ where: { id: maxDiffMovie.movieId }, select: { title: true } });
          if (movie) {
            controversial = { title: movie.title, userScore: maxDiffMovie.userScore, communityScore: maxDiffMovie.communityScore };
          }
        }
      }

      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {cats.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#ccc", fontSize: 14, width: 110, flexShrink: 0 }}>{c.label}</span>
              <div style={{ display: "flex", flex: 1, height: 20, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${((c.score ?? 0) / 10) * 100}%`, height: "100%", background: c.score ? scoreHex(c.score) : "#333", borderRadius: 4 }} />
              </div>
              <span style={{ color: c.score ? scoreHex(c.score) : "#666", fontSize: 15, fontWeight: "bold", width: 35, textAlign: "right" as const, flexShrink: 0 }}>{c.score?.toFixed(1) ?? "—"}</span>
            </div>
          ))}
          {/* Contrarian + controversial row */}
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {contrarianScore != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1a1a1a", borderRadius: 8, padding: "8px 14px" }}>
                <span style={{ color: "#888", fontSize: 11 }}>Contrarian Score</span>
                <span style={{ color: contrarianScore >= 30 ? "#ef4444" : contrarianScore >= 15 ? "#eab308" : "#22c55e", fontSize: 18, fontWeight: "bold" }}>{contrarianScore}</span>
              </div>
            )}
            {controversial && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a1a1a", borderRadius: 8, padding: "8px 14px", flex: 1 }}>
                <span style={{ color: "#888", fontSize: 11 }}>Hot Take:</span>
                <span style={{ color: "#ccc", fontSize: 11 }}>{controversial.title.length > 24 ? controversial.title.slice(0, 23) + "…" : controversial.title}</span>
                <span style={{ color: scoreHex(controversial.userScore), fontSize: 12, fontWeight: "bold" }}>{controversial.userScore.toFixed(1)}</span>
                <span style={{ color: "#555", fontSize: 11 }}>vs</span>
                <span style={{ color: scoreHex(controversial.communityScore), fontSize: 12, fontWeight: "bold" }}>{controversial.communityScore.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Habits: Monthly bar chart ──
    else if (tab === "habits") {
      tabTitle = "Watching Habits";
      const seenDated = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id, watchedDate: { not: null } },
        select: { watchedDate: true },
      });
      const monthCounts = new Array(12).fill(0);
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (const s of seenDated) {
        if (s.watchedDate) monthCounts[new Date(s.watchedDate).getMonth()]++;
      }
      const maxM = Math.max(...monthCounts, 1);

      // Total watch hours
      const runtimes = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { runtime: true } } },
      });
      const hours = Math.round(runtimes.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60);

      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150, padding: "0 4px" }}>
            {monthCounts.map((count: number, i: number) => {
              const barH = count > 0 ? Math.max(Math.round((count / maxM) * 130), 6) : 0;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, height: "100%" }}>
                  {count > 0 && <span style={{ color: "#aaa", fontSize: 10, marginBottom: 3 }}>{count}</span>}
                  <div style={{ width: "100%", height: barH, background: count > 0 ? "#3b82f6" : "#1a1a1a", borderRadius: "4px 4px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 4px" }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", flex: 1, justifyContent: "center" }}>
                <span style={{ color: "#666", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
          {hours > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
              <span style={{ color: "#888", fontSize: 12 }}>{hours} total hours watched</span>
            </div>
          )}
        </div>
      );
    }

    const avatarSrc = user.avatarUrl;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={24} height={24} style={{ borderRadius: 12 }} />
              ) : (
                <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, backgroundColor: "#CC0033", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 12 }}>{user.name?.[0]?.toUpperCase() ?? "?"}</span>
                </div>
              )}
              <span style={{ color: "#888", fontSize: 14 }}>{user.name}</span>
            </div>
          </div>

          {/* Title + stats row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>{tabTitle}</span>
              <span style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{yearLabel}</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
                <span style={{ color: "#666", fontSize: 11 }}>Seen</span>
                <span style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>{seenCount}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
                <span style={{ color: "#666", fontSize: 11 }}>Rated</span>
                <span style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>{ratingCount}</span>
              </div>
              {avg.ratistRating != null && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
                  <span style={{ color: "#666", fontSize: 11 }}>Avg</span>
                  <span style={{ color: scoreHex(avg.ratistRating), fontSize: 24, fontWeight: "bold" }}>{avg.ratistRating.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          {chartContent && (
            <div style={{ display: "flex", flexDirection: "column", background: "#111", borderRadius: 12, padding: 20, flex: 1 }}>
              {chartContent}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", marginTop: 16, alignItems: "center", gap: 6 }}>
            <span style={{ color: "#CC0033", fontSize: 12 }}>theratist.com</span>
            <span style={{ color: "#444", fontSize: 12 }}>· My Analytics</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err: any) {
    console.error("OG analytics error:", err?.message ?? err, err?.stack);
    return new Response(`Error: ${err?.message ?? "Unknown"}`, { status: 500 });
  }
}
