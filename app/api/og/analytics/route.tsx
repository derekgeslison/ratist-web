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

    // Build year label
    const yearLabel = yearFrom && yearTo ? `${yearFrom}–${yearTo}` : yearFrom ? `From ${yearFrom}` : yearTo ? `Through ${yearTo}` : "All Time";

    // Fetch basic stats
    const [ratingCount, seenCount, avgRating] = await Promise.all([
      prisma.movieRating.count({ where: { userId: user.id } }),
      prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      prisma.movieRating.aggregate({ where: { userId: user.id }, _avg: { ratistRating: true } }),
    ]);

    // Tab-specific data
    let tabTitle = "My Analytics";
    let stats: { label: string; value: string; color?: string }[] = [];

    if (tab === "overview") {
      tabTitle = "Movie Analytics Overview";
      stats = [
        { label: "Movies Seen", value: String(seenCount) },
        { label: "Movies Rated", value: String(ratingCount) },
        { label: "Avg Rating", value: avgRating._avg.ratistRating?.toFixed(1) ?? "—", color: avgRating._avg.ratistRating ? scoreHex(avgRating._avg.ratistRating) : undefined },
      ];
    } else if (tab === "genres") {
      tabTitle = "Genre Breakdown";
      const genres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 5,
      });
      const genreNames = await prisma.genre.findMany({ where: { id: { in: genres.map((g) => g.genreId) } } });
      const nameMap = new Map(genreNames.map((g) => [g.id, g.name]));
      stats = genres.map((g) => ({ label: nameMap.get(g.genreId) ?? "Unknown", value: String(g._count.genreId) }));
    } else if (tab === "people") {
      tabTitle = "Directors & Actors";
      stats = [
        { label: "Movies Seen", value: String(seenCount) },
        { label: "Movies Rated", value: String(ratingCount) },
      ];
    } else if (tab === "insights") {
      tabTitle = "Rating Insights";
      const catAvgs = await prisma.movieRating.aggregate({
        where: { userId: user.id },
        _avg: { storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true, ratistRating: true },
      });
      stats = [
        { label: "Story", value: catAvgs._avg.storyScore?.toFixed(1) ?? "—", color: catAvgs._avg.storyScore ? scoreHex(catAvgs._avg.storyScore) : undefined },
        { label: "Style", value: catAvgs._avg.styleScore?.toFixed(1) ?? "—", color: catAvgs._avg.styleScore ? scoreHex(catAvgs._avg.styleScore) : undefined },
        { label: "Emotion", value: catAvgs._avg.emotiveScore?.toFixed(1) ?? "—", color: catAvgs._avg.emotiveScore ? scoreHex(catAvgs._avg.emotiveScore) : undefined },
        { label: "Acting", value: catAvgs._avg.actingScore?.toFixed(1) ?? "—", color: catAvgs._avg.actingScore ? scoreHex(catAvgs._avg.actingScore) : undefined },
        { label: "Fun", value: catAvgs._avg.entertainScore?.toFixed(1) ?? "—", color: catAvgs._avg.entertainScore ? scoreHex(catAvgs._avg.entertainScore) : undefined },
      ];
    } else if (tab === "habits") {
      tabTitle = "Watching Habits";
      const totalRuntime = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { runtime: true } } },
      });
      const hours = Math.round(totalRuntime.reduce((sum, s) => sum + (s.movie.runtime ?? 0), 0) / 60);
      stats = [
        { label: "Movies Seen", value: String(seenCount) },
        { label: "Total Hours", value: String(hours) },
        { label: "Full Days", value: String(Math.round(hours / 24)) },
      ];
    }

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {user.avatarUrl && <img src={user.avatarUrl} width={28} height={28} style={{ borderRadius: 14 }} />}
              <span style={{ color: "#888", fontSize: 16 }}>{user.name}</span>
            </div>
          </div>

          {/* Title */}
          <h1 style={{ color: "white", fontSize: 42, fontWeight: "bold", margin: "0 0 8px 0" }}>{tabTitle}</h1>
          <p style={{ color: "#888", fontSize: 18, margin: "0 0 32px 0" }}>{yearLabel}</p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {stats.map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 16, padding: "20px 32px", minWidth: 140 }}>
                <span style={{ color: "#666", fontSize: 14, marginBottom: 4 }}>{s.label}</span>
                <span style={{ color: s.color ?? "white", fontSize: 36, fontWeight: "bold" }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#CC0033", fontSize: 13 }}>theratist.com</span>
            <span style={{ color: "#444", fontSize: 13 }}>· My Analytics</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    console.error("OG analytics error:", err);
    return new Response("Error", { status: 500 });
  }
}
