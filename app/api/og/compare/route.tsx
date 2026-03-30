import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";
import { getLogoBase64 } from "@/lib/og-helpers";

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

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48, alignItems: "center", justifyContent: "center" }}>
          {/* Header */}
          <img src={getLogoBase64()} width={40} height={40} style={{ borderRadius: 8, marginBottom: 32 }} />

          <span style={{ color: "#555", fontSize: 14, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 32 }}>Taste Match</span>

          {/* Users + score */}
          <div style={{ display: "flex", alignItems: "center", gap: 40, marginBottom: 40 }}>
            {/* User 1 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", width: 80, height: 80, borderRadius: 40, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontSize: 32, fontWeight: 900 }}>{user1.name[0]?.toUpperCase()}</span>
              </div>
              <span style={{ color: "white", fontSize: 18, fontWeight: 700 }}>{user1.name}</span>
            </div>

            {/* Score */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: matchColor, fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{overallMatch}%</span>
              <span style={{ color: matchColor, fontSize: 16, fontWeight: 600 }}>{matchLabel}</span>
            </div>

            {/* User 2 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", width: 80, height: 80, borderRadius: 40, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontSize: 32, fontWeight: 900 }}>{user2.name[0]?.toUpperCase()}</span>
              </div>
              <span style={{ color: "white", fontSize: 18, fontWeight: 700 }}>{user2.name}</span>
            </div>
          </div>

          <span style={{ color: "#444", fontSize: 16 }}>Find your taste match at theratist.com</span>
        </div>
      ),
      { width: 800, height: 450 }
    );
  } catch (err) {
    console.error("OG compare error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
