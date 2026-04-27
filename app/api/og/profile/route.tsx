import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true, bio: true, createdAt: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const [ratingCount, seenCount, avgRating, tvRatingCount, tvSeenCount, episodesWatched, topRatings, followerCount] = await Promise.all([
      prisma.movieRating.count({ where: { userId: user.id } }),
      prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      prisma.movieRating.aggregate({
        where: { userId: user.id, ratistRating: { not: null } },
        _avg: { ratistRating: true },
      }),
      prisma.tVShowRating.count({ where: { userId: user.id } }),
      prisma.userFavoriteShow.count({ where: { userId: user.id } }),
      prisma.episodeSeen.count({ where: { userId: user.id } }),
      prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { not: null } },
        select: { ratistRating: true, movie: { select: { posterPath: true, title: true } } },
        orderBy: { ratistRating: "desc" },
        take: 5,
      }),
      prisma.userFollow.count({ where: { followingId: user.id, status: "accepted" } }),
    ]);

    const totalRated = ratingCount + tvRatingCount;
    const totalSeen = seenCount + tvSeenCount;
    const avg = avgRating._avg.ratistRating;
    const avatarSrc = user.avatarUrl;
    const posterUrls = topRatings
      .filter((r) => r.movie.posterPath)
      .map((r) => `https://image.tmdb.org/t/p/w185${r.movie.posterPath}`)
      .slice(0, 5);

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
          </div>

          {/* Profile info row */}
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
            {/* Avatar */}
            {avatarSrc ? (
              <img src={avatarSrc} width={80} height={80} style={{ borderRadius: 40, objectFit: "cover" }} />
            ) : (
              <div style={{
                display: "flex", width: 80, height: 80, borderRadius: 40,
                backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 32, fontWeight: 800,
              }}>
                {user.name[0]?.toUpperCase()}
              </div>
            )}

            {/* Name + bio */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: 800, lineHeight: 1.2 }}>{user.name}</span>
              {user.bio && (
                <span style={{ color: "#999", fontSize: 14, marginTop: 4, lineHeight: 1.4 }}>
                  {user.bio.length > 80 ? user.bio.slice(0, 80) + "..." : user.bio}
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
            {[
              { label: "Movies Rated", value: String(ratingCount) },
              { label: "Movies Seen", value: String(seenCount) },
              { label: "Avg Rating", value: avg ? avg.toFixed(1) : "—", color: avg ? scoreHex(avg) : "#666" },
              ...(tvSeenCount > 0 ? [
                { label: "Shows Seen", value: String(tvSeenCount), color: "#60a5fa" },
                { label: "Episodes", value: String(episodesWatched), color: "#60a5fa" },
              ] : []),
              { label: "Followers", value: String(followerCount) },
            ].map((stat) => (
              <div key={stat.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ color: stat.color ?? "white", fontSize: 24, fontWeight: 800 }}>{stat.value}</span>
                <span style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Top rated posters */}
          {posterUrls.length > 0 && (
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, alignSelf: "center", marginRight: 4 }}>Top rated</span>
              {posterUrls.map((url, i) => (
                <img key={i} src={url} width={70} height={105} style={{ borderRadius: 6, objectFit: "cover" }} />
              ))}
            </div>
          )}
        </div>
      ),
      { width: 800, height: 420 }
    );
  } catch (err) {
    console.error("Profile OG error:", err);
    return new Response("Error generating image", { status: 500 });
  }
}
