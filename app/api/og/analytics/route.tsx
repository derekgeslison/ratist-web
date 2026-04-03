import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const tab = searchParams.get("tab") ?? "overview";
  const yearFrom = searchParams.get("yearFrom") ?? "";
  const yearTo = searchParams.get("yearTo") ?? "";

  try {
    const logoSrc = getLogoBase64();
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const yearLabel = yearFrom && yearTo ? `${yearFrom}–${yearTo}` : yearFrom ? `From ${yearFrom}` : yearTo ? `Through ${yearTo}` : "All Time";

    // Common header
    const header = (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
          <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user.avatarUrl && <img src={user.avatarUrl} width={26} height={26} style={{ borderRadius: 13 }} />}
          <span style={{ color: "#888", fontSize: 14 }}>{user.name}</span>
        </div>
      </div>
    );

    const footer = (
      <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#CC0033", fontSize: 12 }}>theratist.com</span>
        <span style={{ color: "#444", fontSize: 12 }}>· My Analytics · {yearLabel}</span>
      </div>
    );

    let content: React.ReactNode;

    if (tab === "overview") {
      const [ratingCount, seenCount, avgRating] = await Promise.all([
        prisma.movieRating.count({ where: { userId: user.id } }),
        prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
        prisma.movieRating.aggregate({ where: { userId: user.id }, _avg: { ratistRating: true } }),
      ]);
      // Decade breakdown from rated movies only (smaller dataset)
      const ratedMovies = await prisma.movieRating.findMany({
        where: { userId: user.id },
        select: { movie: { select: { releaseDate: true } } },
        take: 200,
      });
      const decadeMap = new Map<string, number>();
      for (const r of ratedMovies) {
        const year = r.movie.releaseDate?.slice(0, 3);
        if (year) decadeMap.set(year + "0s", (decadeMap.get(year + "0s") ?? 0) + 1);
      }
      const decades = [...decadeMap.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 5);
      const maxDecade = Math.max(...decades.map(([, c]) => c), 1);

      content = (
        <>
          <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: "0 0 20px 0" }}>Movie Analytics Overview</h1>
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Seen</span>
              <span style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>{seenCount}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Rated</span>
              <span style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>{ratingCount}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Avg Rating</span>
              <span style={{ color: avgRating._avg.ratistRating ? scoreHex(avgRating._avg.ratistRating) : "white", fontSize: 32, fontWeight: "bold" }}>{avgRating._avg.ratistRating?.toFixed(1) ?? "—"}</span>
            </div>
          </div>
          {/* Decade bar chart */}
          <div style={{ display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 12, padding: 20, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>By Decade</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              {decades.map(([decade, count]) => (
                <div key={decade} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#888", fontSize: 12, width: 40 }}>{decade}</span>
                  <div style={{ flex: 1, height: 16, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(count / maxDecade) * 100}%`, height: "100%", background: "#CC0033", borderRadius: 4 }} />
                  </div>
                  <span style={{ color: "#888", fontSize: 12, width: 30, textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    } else if (tab === "genres") {
      const genres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 8,
      });
      const genreNames = await prisma.genre.findMany({ where: { id: { in: genres.map((g) => g.genreId) } } });
      const nameMap = new Map(genreNames.map((g) => [g.id, g.name]));
      const maxGenre = Math.max(...genres.map((g) => g._count.genreId), 1);

      content = (
        <>
          <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: "0 0 20px 0" }}>Genre Breakdown</h1>
          <div style={{ display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 12, padding: 20, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {genres.map((g) => (
                <div key={g.genreId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#ccc", fontSize: 14, width: 120 }}>{nameMap.get(g.genreId) ?? "?"}</span>
                  <div style={{ flex: 1, height: 20, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(g._count.genreId / maxGenre) * 100}%`, height: "100%", background: "#CC0033", borderRadius: 4 }} />
                  </div>
                  <span style={{ color: "#888", fontSize: 14, width: 35, textAlign: "right" }}>{g._count.genreId}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    } else if (tab === "people") {
      // Top directors from rated movies (lighter query)
      const ratedIds = (await prisma.movieRating.findMany({ where: { userId: user.id }, select: { movieId: true }, take: 100 })).map((r) => r.movieId);
      const directors = ratedIds.length > 0 ? await prisma.movieCast.groupBy({
        by: ["celebrityId"],
        where: { movieId: { in: ratedIds }, creditType: "crew", job: "Director" },
        _count: { celebrityId: true },
        orderBy: { _count: { celebrityId: "desc" } },
        take: 5,
      }) : [];
      const dirNames = await prisma.celebrity.findMany({ where: { id: { in: directors.map((d) => d.celebrityId) } }, select: { id: true, name: true } });
      const dirNameMap = new Map(dirNames.map((d) => [d.id, d.name]));
      const maxDir = Math.max(...directors.map((d) => d._count.celebrityId), 1);

      content = (
        <>
          <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: "0 0 20px 0" }}>Directors & Actors</h1>
          <div style={{ display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 12, padding: 20, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>Most Watched Directors</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {directors.map((d) => (
                <div key={d.celebrityId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#ccc", fontSize: 14, width: 160 }}>{dirNameMap.get(d.celebrityId) ?? "?"}</span>
                  <div style={{ flex: 1, height: 20, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(d._count.celebrityId / maxDir) * 100}%`, height: "100%", background: "#CC0033", borderRadius: 4 }} />
                  </div>
                  <span style={{ color: "#888", fontSize: 14, width: 30, textAlign: "right" }}>{d._count.celebrityId}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    } else if (tab === "insights") {
      const [catAvgs, ratedCount] = await Promise.all([
        prisma.movieRating.aggregate({
          where: { userId: user.id },
          _avg: { storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true, ratistRating: true },
        }),
        prisma.movieRating.count({ where: { userId: user.id } }),
      ]);
      const cats = [
        { label: "Story", score: catAvgs._avg.storyScore },
        { label: "Style", score: catAvgs._avg.styleScore },
        { label: "Emotion", score: catAvgs._avg.emotiveScore },
        { label: "Acting", score: catAvgs._avg.actingScore },
        { label: "Entertainment", score: catAvgs._avg.entertainScore },
      ];

      content = (
        <>
          <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: "0 0 8px 0" }}>Rating Insights</h1>
          <p style={{ color: "#888", fontSize: 14, margin: "0 0 20px 0" }}>Average scores across {ratedCount} rated movies</p>
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Overall Avg</span>
              <span style={{ color: catAvgs._avg.ratistRating ? scoreHex(catAvgs._avg.ratistRating) : "white", fontSize: 36, fontWeight: "bold" }}>{catAvgs._avg.ratistRating?.toFixed(1) ?? "—"}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 12, padding: 20, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cats.map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#ccc", fontSize: 14, width: 110 }}>{c.label}</span>
                  <div style={{ flex: 1, height: 22, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${((c.score ?? 0) / 10) * 100}%`, height: "100%", background: c.score ? scoreHex(c.score) : "#333", borderRadius: 4 }} />
                  </div>
                  <span style={{ color: c.score ? scoreHex(c.score) : "#666", fontSize: 16, fontWeight: "bold", width: 35, textAlign: "right" }}>{c.score?.toFixed(1) ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    } else if (tab === "habits") {
      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { watchedDate: true, movie: { select: { runtime: true } } },
      });
      const hours = Math.round(seenMovies.reduce((sum, s) => sum + (s.movie.runtime ?? 0), 0) / 60);
      // Monthly activity
      const monthCounts = new Array(12).fill(0);
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (const s of seenMovies) {
        if (s.watchedDate) monthCounts[new Date(s.watchedDate).getMonth()]++;
      }
      const maxMonth = Math.max(...monthCounts, 1);
      const barHeight = 120;

      content = (
        <>
          <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: "0 0 20px 0" }}>Watching Habits</h1>
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Movies Seen</span>
              <span style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>{seenMovies.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Total Hours</span>
              <span style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>{hours}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Full Days</span>
              <span style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>{Math.round(hours / 24)}</span>
            </div>
          </div>
          {/* Monthly bar chart */}
          <div style={{ display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 12, padding: "16px 20px", flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 8 }}>Movies per Month</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: barHeight + 20, flex: 1 }}>
              {monthCounts.map((count, i) => {
                const h = maxMonth > 0 ? Math.round((count / maxMonth) * barHeight) : 0;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                    {count > 0 && <span style={{ color: "#888", fontSize: 9, marginBottom: 2 }}>{count}</span>}
                    <div style={{ width: "100%", height: Math.max(h, count > 0 ? 3 : 0), background: count > 0 ? "#3b82f6" : "transparent", borderRadius: "3px 3px 0 0" }} />
                    <span style={{ color: "#666", fontSize: 9, marginTop: 2 }}>{monthLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
    } else {
      content = <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>My Analytics</h1>;
    }

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {header}
          {content}
          {footer}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err: any) {
    console.error("OG analytics error:", err?.message ?? err, err?.stack);
    return new Response(`Error: ${err?.message ?? "Unknown"}`, { status: 500 });
  }
}
