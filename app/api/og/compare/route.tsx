import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";

export const dynamic = "force-dynamic";

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;
const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery",
] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId1 = searchParams.get("userId1") ?? "";
  const userId2 = searchParams.get("userId2") ?? "";

  try {
    const [user1, user2] = await Promise.all([
      prisma.user.findFirst({
        where: { OR: [{ id: userId1 }, { firebaseUid: userId1 }] },
        include: { profile: true },
      }),
      prisma.user.findFirst({
        where: { OR: [{ id: userId2 }, { firebaseUid: userId2 }] },
        include: { profile: true },
      }),
    ]);
    if (!user1 || !user2) return new Response("Not found", { status: 404 });

    let overallMatch = 0;
    if (user1.profile && user2.profile) {
      const p1 = user1.profile as unknown as Record<string, number>;
      const p2 = user2.profile as unknown as Record<string, number>;
      const allKeys = [...COMPONENT_KEYS, ...GENRE_KEYS];
      const sims = allKeys.map((k) => dimensionSimilarity(p1[k] ?? 0, p2[k] ?? 0));
      overallMatch = Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 100);
    }

    const matchColor = overallMatch >= 80 ? "#22c55e" : overallMatch >= 60 ? "#eab308" : "#888888";
    const matchLabel = overallMatch >= 80 ? "Very similar taste" : overallMatch >= 60 ? "Good overlap" : "Different tastes";

    // Avatar images
    const avatar1 = user1.avatarUrl ?? null;
    const avatar2 = user2.avatarUrl ?? null;

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            background: "#0f0f0f",
            fontFamily: "sans-serif",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            padding: "60px 80px",
          }}
        >
          {/* Branding */}
          <span style={{ color: "#ef3b36", fontWeight: 900, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 48 }}>
            The Ratist · Taste Match
          </span>

          {/* Users row */}
          <div style={{ display: "flex", alignItems: "center", gap: 48, marginBottom: 48 }}>
            {/* User 1 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 100, height: 100, borderRadius: 50, overflow: "hidden", background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {avatar1 ? (
                  <img src={avatar1} style={{ width: 100, height: 100, objectFit: "cover" }} alt="" />
                ) : (
                  <span style={{ color: "#fff", fontSize: 40, fontWeight: 900 }}>{user1.name[0]?.toUpperCase()}</span>
                )}
              </div>
              <span style={{ color: "#ffffff", fontSize: 22, fontWeight: 700 }}>{user1.name}</span>
            </div>

            {/* Match score */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ color: matchColor, fontSize: 80, fontWeight: 900, lineHeight: 1 }}>{overallMatch}%</span>
              <span style={{ color: matchColor, fontSize: 18, fontWeight: 600 }}>{matchLabel}</span>
            </div>

            {/* User 2 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 100, height: 100, borderRadius: 50, overflow: "hidden", background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {avatar2 ? (
                  <img src={avatar2} style={{ width: 100, height: 100, objectFit: "cover" }} alt="" />
                ) : (
                  <span style={{ color: "#fff", fontSize: 40, fontWeight: 900 }}>{user2.name[0]?.toUpperCase()}</span>
                )}
              </div>
              <span style={{ color: "#ffffff", fontSize: 22, fontWeight: 700 }}>{user2.name}</span>
            </div>
          </div>

          {/* Footer */}
          <span style={{ color: "#555555", fontSize: 18 }}>theratist.com · Find your taste match</span>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return new Response("Error", { status: 500 });
  }
}
