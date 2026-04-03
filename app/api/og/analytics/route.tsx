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

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
      <span style={{ color: "#666", fontSize: 11 }}>{label}</span>
      <span style={{ color: color ?? "white", fontSize: 24, fontWeight: "bold" }}>{value}</span>
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

    let tabTitle = "My Analytics";
    let chartContent: React.ReactNode = null;
    let statsContent: React.ReactNode = null;

    // ── Overview: Decade breakdown + rich stats ──
    if (tab === "overview") {
      tabTitle = "Movie Analytics";

      const [ratingCount, seenCount] = await Promise.all([
        prisma.movieRating.count({ where: { userId: user.id } }),
        prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      ]);

      // Get seen movies with runtime and release date for decades + hours
      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { releaseDate: true, runtime: true } } },
      });
      const totalHours = Math.round(seenMovies.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60);

      // Top genre
      const topGenre = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 1,
      });
      let favGenre = "—";
      if (topGenre.length > 0) {
        const g = await prisma.genre.findUnique({ where: { id: topGenre[0].genreId }, select: { name: true } });
        if (g) favGenre = g.name;
      }

      // Decade breakdown
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

      statsContent = (
        <div style={{ display: "flex", gap: 12 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Rated" value={String(ratingCount)} />
          <Stat label="Hours" value={String(totalHours)} />
          <Stat label="Top Genre" value={favGenre} />
        </div>
      );
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
      const seenCount = await prisma.userFavoriteMovie.count({ where: { userId: user.id } });
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
      const totalGenres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
      });

      statsContent = (
        <div style={{ display: "flex", gap: 12 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Genres" value={String(totalGenres.length)} />
          <Stat label="#1 Genre" value={genres.length > 0 ? (nameMap.get(genres[0].genreId) ?? "?") : "—"} />
        </div>
      );
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {genres.map((g) => (
            <Bar key={g.genreId} label={nameMap.get(g.genreId) ?? "?"} value={g._count.genreId} max={maxG} />
          ))}
        </div>
      );
    }

    // ── Directors & Actors: Based on ALL seen movies ──
    else if (tab === "people") {
      tabTitle = "Directors & Actors";

      // Use ALL seen movies, not just rated
      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movieId: true },
      });
      const movieIds = seenMovies.map((s) => s.movieId);

      let dirBars: React.ReactNode = null;
      let actorBars: React.ReactNode = null;
      let topDirName = "—";
      let topActName = "—";

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
        const topDirs = [...dirCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
        const maxDir = Math.max(...topDirs.map(([, c]) => c), 1);
        if (topDirs.length > 0) topDirName = topDirs[0][0];

        // Actors (top 3 billed)
        const actCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "cast", castOrder: { lte: 3 } },
          select: { celebrity: { select: { name: true } } },
        });
        const actCounts = new Map<string, number>();
        for (const ac of actCredits) {
          actCounts.set(ac.celebrity.name, (actCounts.get(ac.celebrity.name) ?? 0) + 1);
        }
        const topActs = [...actCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
        const maxAct = Math.max(...topActs.map(([, c]) => c), 1);
        if (topActs.length > 0) topActName = topActs[0][0];

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

      statsContent = (
        <div style={{ display: "flex", gap: 12 }}>
          <Stat label="Seen" value={String(movieIds.length)} />
          <Stat label="Top Director" value={topDirName.length > 14 ? topDirName.slice(0, 13) + "…" : topDirName} />
          <Stat label="Top Actor" value={topActName.length > 14 ? topActName.slice(0, 13) + "…" : topActName} />
        </div>
      );
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
      const avgRating = await prisma.movieRating.aggregate({
        where: { userId: user.id },
        _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      });
      const avg = avgRating._avg;
      const ratingCount = await prisma.movieRating.count({ where: { userId: user.id } });

      const cats = [
        { label: "Story", score: avg.storyScore },
        { label: "Style", score: avg.styleScore },
        { label: "Emotion", score: avg.emotiveScore },
        { label: "Acting", score: avg.actingScore },
        { label: "Entertainment", score: avg.entertainScore },
      ];

      // Contrarian score — compare user's ratistRating to TMDB voteAverage (matching the real analytics API)
      const userRatings = await prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { not: null } },
        select: { movieId: true, ratistRating: true, movie: { select: { title: true, voteAverage: true } } },
      });
      let contrarianScore: number | null = null;
      let controversial: { title: string; userScore: number; communityScore: number } | null = null;

      let totalDeviation = 0;
      let deviationCount = 0;
      let maxDiff = 0;
      let maxDiffEntry: { title: string; userScore: number; communityScore: number } | null = null;

      for (const r of userRatings) {
        if (r.movie.voteAverage != null && r.movie.voteAverage > 0 && r.ratistRating != null) {
          const diff = Math.abs(r.ratistRating - r.movie.voteAverage);
          totalDeviation += diff;
          deviationCount++;
          if (diff > maxDiff) {
            maxDiff = diff;
            maxDiffEntry = { title: r.movie.title, userScore: r.ratistRating, communityScore: r.movie.voteAverage };
          }
        }
      }
      if (deviationCount > 0) {
        contrarianScore = Math.round((totalDeviation / deviationCount) * 10) / 10;
      }
      if (maxDiffEntry) controversial = maxDiffEntry;

      statsContent = (
        <div style={{ display: "flex", gap: 12 }}>
          <Stat label="Rated" value={String(ratingCount)} />
          {avg.ratistRating != null && <Stat label="Avg Rating" value={avg.ratistRating.toFixed(1)} color={scoreHex(avg.ratistRating)} />}
          {contrarianScore != null && <Stat label="Contrarian" value={contrarianScore.toFixed(1)} color={contrarianScore >= 2 ? "#ef4444" : contrarianScore >= 1 ? "#eab308" : "#22c55e"} />}
        </div>
      );
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
          {controversial && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a1a1a", borderRadius: 8, padding: "8px 14px", marginTop: 4 }}>
              <span style={{ color: "#888", fontSize: 12 }}>Hottest Take:</span>
              <span style={{ color: "#ccc", fontSize: 12 }}>{controversial.title.length > 28 ? controversial.title.slice(0, 27) + "…" : controversial.title}</span>
              <span style={{ color: scoreHex(controversial.userScore), fontSize: 13, fontWeight: "bold" }}>{controversial.userScore.toFixed(1)}</span>
              <span style={{ color: "#555", fontSize: 11 }}>vs</span>
              <span style={{ color: scoreHex(controversial.communityScore), fontSize: 13, fontWeight: "bold" }}>{controversial.communityScore.toFixed(1)}</span>
            </div>
          )}
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
      const totalDated = seenDated.length;

      // Total watch hours + seen count
      const seenCount = await prisma.userFavoriteMovie.count({ where: { userId: user.id } });
      const runtimes = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { runtime: true } } },
      });
      const hours = Math.round(runtimes.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60);

      // Find peak month
      let peakIdx = 0;
      for (let i = 1; i < 12; i++) {
        if (monthCounts[i] > monthCounts[peakIdx]) peakIdx = i;
      }

      statsContent = (
        <div style={{ display: "flex", gap: 12 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Hours" value={String(hours)} />
          <Stat label="Logged" value={String(totalDated)} />
          <Stat label="Peak Month" value={monthLabels[peakIdx]} />
        </div>
      );
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "flex-end", flex: 1, gap: 8, padding: "0 8px" }}>
            {monthCounts.map((count: number, i: number) => {
              const barH = count > 0 ? Math.max(Math.round((count / maxM) * 100), 4) : 0;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                  {count > 0 && <span style={{ color: "#aaa", fontSize: 11, marginBottom: 4 }}>{count}</span>}
                  <div style={{ width: "70%", height: barH, background: count > 0 ? "#3b82f6" : "#1a1a1a", borderRadius: "4px 4px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "6px 8px 0", borderTop: "1px solid #222" }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", flex: 1, justifyContent: "center" }}>
                <span style={{ color: "#666", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
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

          {/* Title + tab-specific stats */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>{tabTitle}</span>
              <span style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{yearLabel}</span>
            </div>
            {statsContent}
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
