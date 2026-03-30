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

    // Get top 10 rated movies, optionally filtered by year
    const where: Record<string, unknown> = { userId: user.id, ratistRating: { not: null } };
    if (year) {
      where.movie = { releaseDate: { startsWith: year } };
    }

    const ratings = await prisma.movieRating.findMany({
      where,
      orderBy: { ratistRating: "desc" },
      take: 10,
      include: { movie: { select: { title: true, posterPath: true, releaseDate: true } } },
    });

    if (ratings.length === 0) return new Response("No ratings", { status: 404 });

    const avatarSrc = user.avatarUrl;
    const label = year ? `Top ${Math.min(ratings.length, 10)} of ${year}` : `Top ${Math.min(ratings.length, 10)} All Time`;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <img src={logoSrc} width={40} height={40} style={{ borderRadius: 8 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={28} height={28} style={{ borderRadius: 14 }} />
              ) : (
                <div style={{ display: "flex", width: 28, height: 28, borderRadius: 14, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 14 }}>{user.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "#aaa", fontSize: 16, fontWeight: 600 }}>{user.name}</span>
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <span style={{ color: "#ef3b36", fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const }}>{label}</span>
          </div>

          {/* Rankings list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {ratings.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#444", fontSize: 16, fontWeight: 800, width: 24, textAlign: "right" as const }}>{i + 1}</span>
                {r.movie.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${r.movie.posterPath}`}
                    width={28}
                    height={42}
                    style={{ borderRadius: 4, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ display: "flex", width: 28, height: 42, borderRadius: 4, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#555", fontSize: 10 }}>?</span>
                  </div>
                )}
                <span style={{ color: "#ddd", fontSize: 16, fontWeight: 600, flex: 1 }}>
                  {r.movie.title.length > 38 ? r.movie.title.slice(0, 38) + "..." : r.movie.title}
                </span>
                <span style={{ color: "#666", fontSize: 13 }}>{r.movie.releaseDate?.slice(0, 4)}</span>
                <span style={{ color: scoreHex(r.ratistRating!), fontSize: 16, fontWeight: 800, width: 32 }}>
                  {r.ratistRating!.toFixed(1)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <span style={{ color: "#333", fontSize: 14 }}>theratist.com</span>
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
