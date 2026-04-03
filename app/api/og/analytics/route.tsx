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

    // Fetch core stats
    const [ratingCount, seenCount, avgRating] = await Promise.all([
      prisma.movieRating.count({ where: { userId: user.id } }),
      prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      prisma.movieRating.aggregate({ where: { userId: user.id }, _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true } }),
    ]);
    const avg = avgRating._avg;

    let tabTitle = "My Analytics";
    let chartContent: React.ReactNode = null;

    if (tab === "overview") {
      tabTitle = "Movie Analytics";
      // Genre counts
      const genres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 6,
      });
      const genreNames = await prisma.genre.findMany({ where: { id: { in: genres.map((g) => g.genreId) } } });
      const nameMap = new Map(genreNames.map((g) => [g.id, g.name]));
      const maxG = Math.max(...genres.map((g) => g._count.genreId), 1);
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {genres.map((g) => <Bar key={g.genreId} label={nameMap.get(g.genreId) ?? "?"} value={g._count.genreId} max={maxG} />)}
        </div>
      );
    } else if (tab === "genres") {
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
          {genres.map((g) => <Bar key={g.genreId} label={nameMap.get(g.genreId) ?? "?"} value={g._count.genreId} max={maxG} />)}
        </div>
      );
    } else if (tab === "people") {
      tabTitle = "Directors & Actors";
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 32px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Movies Seen</span>
              <span style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>{seenCount}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "14px 32px" }}>
              <span style={{ color: "#666", fontSize: 12 }}>Movies Rated</span>
              <span style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>{ratingCount}</span>
            </div>
          </div>
        </div>
      );
    } else if (tab === "insights") {
      tabTitle = "Rating Insights";
      const cats = [
        { label: "Story", score: avg.storyScore },
        { label: "Style", score: avg.styleScore },
        { label: "Emotion", score: avg.emotiveScore },
        { label: "Acting", score: avg.actingScore },
        { label: "Entertainment", score: avg.entertainScore },
      ];
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cats.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#ccc", fontSize: 14, width: 110, flexShrink: 0 }}>{c.label}</span>
              <div style={{ display: "flex", flex: 1, height: 20, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${((c.score ?? 0) / 10) * 100}%`, height: "100%", background: c.score ? scoreHex(c.score) : "#333", borderRadius: 4 }} />
              </div>
              <span style={{ color: c.score ? scoreHex(c.score) : "#666", fontSize: 15, fontWeight: "bold", width: 35, textAlign: "right" as const, flexShrink: 0 }}>{c.score?.toFixed(1) ?? "—"}</span>
            </div>
          ))}
        </div>
      );
    } else if (tab === "habits") {
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
      chartContent = (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
          {monthCounts.map((count, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
              {count > 0 && <span style={{ color: "#888", fontSize: 9, marginBottom: 2 }}>{count}</span>}
              <div style={{ width: "100%", height: Math.max(Math.round((count / maxM) * 120), count > 0 ? 3 : 0), background: count > 0 ? "#3b82f6" : "transparent", borderRadius: "3px 3px 0 0" }} />
              <span style={{ color: "#666", fontSize: 9, marginTop: 2 }}>{monthLabels[i]}</span>
            </div>
          ))}
        </div>
      );
    }

    const hours = tab === "habits" ? Math.round((await prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movie: { select: { runtime: true } } } })).reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60) : 0;

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
              <span style={{ color: "#888", fontSize: 14 }}>{user.name}</span>
            </div>
          </div>

          {/* Title + stats row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h1 style={{ color: "white", fontSize: 32, fontWeight: "bold", margin: 0 }}>{tabTitle}</h1>
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
              {avg.ratistRating && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
                  <span style={{ color: "#666", fontSize: 11 }}>Avg</span>
                  <span style={{ color: scoreHex(avg.ratistRating), fontSize: 24, fontWeight: "bold" }}>{avg.ratistRating.toFixed(1)}</span>
                </div>
              )}
              {tab === "habits" && hours > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 20px" }}>
                  <span style={{ color: "#666", fontSize: 11 }}>Hours</span>
                  <span style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>{hours}</span>
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
      { width: 1200, height: 630 }
    );
  } catch (err: any) {
    console.error("OG analytics error:", err?.message ?? err, err?.stack);
    return new Response(`Error: ${err?.message ?? "Unknown"}`, { status: 500 });
  }
}
