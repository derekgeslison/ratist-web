import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const session = await prisma.screeningSession.findUnique({
      where: { id: sessionId },
      select: {
        movieTitle: true,
        posterPath: true,
        startedAt: true,
        participants: {
          select: { user: { select: { name: true, avatarUrl: true } } },
        },
        ratings: {
          select: { ratistRating: true, user: { select: { name: true } } },
        },
      },
    });

    if (!session) return new Response("Not found", { status: 404 });

    const posterUrl = session.posterPath
      ? `https://image.tmdb.org/t/p/w300${session.posterPath}`
      : null;

    const dateStr = session.startedAt
      ? new Date(session.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
            padding: "40px",
            fontFamily: "sans-serif",
          }}
        >
          {/* Left: Poster */}
          {posterUrl && (
            <div style={{ display: "flex", marginRight: "40px", flexShrink: 0 }}>
              <img
                src={posterUrl}
                width={250}
                height={375}
                style={{ borderRadius: "16px", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Right: Info */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
            {/* Top */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                <img src={logoSrc} width={40} height={40} />
                <span style={{ color: "#CC0033", fontSize: "14px", marginLeft: "12px", letterSpacing: "2px", textTransform: "uppercase" }}>
                  Screening Room Recap
                </span>
              </div>

              <h1 style={{ color: "white", fontSize: "48px", fontWeight: "bold", lineHeight: 1.1, margin: "8px 0" }}>
                {session.movieTitle ?? "Untitled"}
              </h1>

              <p style={{ color: "#888", fontSize: "18px", margin: "4px 0" }}>
                {dateStr} · {session.participants.length} watchers
              </p>
            </div>

            {/* Ratings */}
            {session.ratings.length > 0 && (
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", margin: "20px 0" }}>
                {session.ratings.map((r, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#222", borderRadius: "12px", padding: "16px 24px", minWidth: "120px" }}>
                    <span style={{ color: "#888", fontSize: "14px", marginBottom: "4px" }}>{r.user.name}</span>
                    <span style={{ color: r.ratistRating ? scoreHex(r.ratistRating) : "white", fontSize: "36px", fontWeight: "bold" }}>
                      {r.ratistRating?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Participants */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {session.participants.slice(0, 6).map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", background: "#333", borderRadius: "20px", padding: "6px 14px" }}>
                  <span style={{ color: "white", fontSize: "14px" }}>{p.user.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    console.error("OG screening error:", err);
    return new Response("Error", { status: 500 });
  }
}
