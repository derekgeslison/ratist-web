import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const year = searchParams.get("year"); // optional — null means all-time

  try {
    const logoSrc = getLogoBase64();

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    // Check for saved custom rankings first
    const listKey = year ?? "all-time";
    type RankedItem = { title: string; posterPath: string | null; year: string; ratistRating: number | null };
    let top10: RankedItem[] = [];

    const savedRankings = await prisma.userMovieRanking.findMany({
      where: { userId: user.id, listKey },
      include: { movie: { select: { id: true, title: true, posterPath: true, releaseDate: true } } },
      orderBy: { sortOrder: "asc" },
      take: 10,
    });

    if (savedRankings.length > 0) {
      const movieIds = savedRankings.filter((r) => r.movieId).map((r) => r.movieId!);
      const ratings = await prisma.movieRating.findMany({
        where: { userId: user.id, movieId: { in: movieIds } },
        select: { movieId: true, ratistRating: true },
      });
      const ratingMap = new Map(ratings.map((r) => [r.movieId, r.ratistRating]));
      top10 = savedRankings.filter((r) => r.movie).map((r) => ({
        title: r.movie!.title,
        posterPath: r.movie!.posterPath,
        year: r.movie!.releaseDate?.slice(0, 4) ?? "",
        ratistRating: ratingMap.get(r.movieId!) ?? null,
      }));
    } else {
      // Fallback: rating-sorted
      const ratings = await prisma.movieRating.findMany({
        where: { userId: user.id },
        include: { movie: { select: { title: true, posterPath: true, releaseDate: true } } },
      });
      const sorted = ratings.slice().sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0));
      let allMovies = sorted.map((r) => ({
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: r.ratistRating,
      }));
      if (year) allMovies = allMovies.filter((m) => m.year === year);
      top10 = allMovies.slice(0, 10);
    }
    if (top10.length === 0) return new Response("No movies", { status: 404 });

    const avatarSrc = user.avatarUrl;
    let listLabel = year ?? "All Time";
    if (year?.startsWith("custom-")) {
      const customList = await prisma.userRankingList.findFirst({ where: { userId: user.id, listKey: year }, select: { name: true } });
      listLabel = customList?.name ?? "Custom List";
    }
    const label = `Top ${Math.min(top10.length, 10)} of ${listLabel}`;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={26} height={26} style={{ borderRadius: 13 }} />
              ) : (
                <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 13 }}>{user.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "#aaa", fontSize: 15, fontWeight: 600 }}>{user.name}</span>
            </div>
          </div>

          {/* Title */}
          <span style={{ color: "#ef3b36", fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 16 }}>{label}</span>

          {/* Rankings list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            {top10.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#444", fontSize: 15, fontWeight: 800, width: 22, textAlign: "right" as const }}>{i + 1}</span>
                {m.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${m.posterPath}`}
                    width={26}
                    height={39}
                    style={{ borderRadius: 3, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ display: "flex", width: 26, height: 39, borderRadius: 3, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#555", fontSize: 9 }}>?</span>
                  </div>
                )}
                <span style={{ color: "#ddd", fontSize: 15, fontWeight: 600, flex: 1 }}>
                  {m.title.length > 36 ? m.title.slice(0, 36) + "..." : m.title}
                </span>
                <span style={{ color: "#555", fontSize: 12 }}>{m.year}</span>
                {m.ratistRating != null ? (
                  <span style={{ color: scoreHex(m.ratistRating), fontSize: 15, fontWeight: 800, width: 30 }}>{m.ratistRating.toFixed(1)}</span>
                ) : (
                  <span style={{ color: "#333", fontSize: 13, width: 30 }}>—</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 800, height: 520 }
    );
  } catch (err) {
    console.error("OG rankings error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
