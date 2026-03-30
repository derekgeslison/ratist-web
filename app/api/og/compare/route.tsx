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

    const avatar1 = user1.avatarUrl ?? null;
    const avatar2 = user2.avatarUrl ?? null;

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1080,
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
            fontFamily: "sans-serif",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1a0808 0%, #0a0a0a 30%, #0a0a0a 100%)", display: "flex" }} />

          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", padding: "64px" }}>
            {/* Branding */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 64 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 24, lineHeight: 1 }}>R</span>
              </div>
              <span style={{ color: "#ef3b36", fontWeight: 800, fontSize: 24 }}>THE RATIST</span>
            </div>

            {/* Taste Match label */}
            <span style={{ color: "#555555", fontSize: 18, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 48 }}>
              Taste Match
            </span>

            {/* Users row */}
            <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 56 }}>
              {/* User 1 */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden", background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #333" }}>
                  {avatar1 ? (
                    <img src={avatar1} style={{ width: 120, height: 120, objectFit: "cover" }} alt="" />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 48, fontWeight: 900 }}>{user1.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span style={{ color: "#ffffff", fontSize: 24, fontWeight: 700 }}>{user1.name}</span>
              </div>

              {/* Match score */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ color: matchColor, fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{overallMatch}%</span>
                <span style={{ color: matchColor, fontSize: 22, fontWeight: 600 }}>{matchLabel}</span>
              </div>

              {/* User 2 */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden", background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #333" }}>
                  {avatar2 ? (
                    <img src={avatar2} style={{ width: 120, height: 120, objectFit: "cover" }} alt="" />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 48, fontWeight: 900 }}>{user2.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span style={{ color: "#ffffff", fontSize: 24, fontWeight: 700 }}>{user2.name}</span>
              </div>
            </div>

            {/* CTA */}
            <span style={{ color: "#555555", fontSize: 20, fontWeight: 500 }}>Find your taste match at theratist.com</span>
          </div>
        </div>
      ),
      { width: 1080, height: 1080 }
    );
  } catch {
    return new Response("Error", { status: 500 });
  }
}
