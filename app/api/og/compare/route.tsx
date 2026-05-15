import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";
import { scoreColor } from "@/lib/score-color";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;
// Short labels — full names overflow the bar column at 800px width.
const COMPONENT_SHORT: Record<string, string> = {
  narrativeFocused: "Story",
  characterFocused: "Chars",
  messageFocused: "Message",
  cinematicFocused: "Cinema",
  performanceFocused: "Acting",
  entertainmentFocused: "Fun",
};

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
    const logoSrc = getLogoBase64();

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

    const p1 = (user1.profile ?? {}) as unknown as Record<string, number>;
    const p2 = (user2.profile ?? {}) as unknown as Record<string, number>;

    // Top shared genre — mirrors the /compare page logic but truncated
    // to the single most-rated overlap. The OG card has no room for a
    // full table, and the headline genre carries the most weight when
    // someone scans a share preview.
    const [ratings1, ratings2] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: user1.id, ratistRating: { not: null } },
        select: { ratistRating: true, movie: { select: { genres: { include: { genre: true } } } } },
      }),
      prisma.movieRating.findMany({
        where: { userId: user2.id, ratistRating: { not: null } },
        select: { ratistRating: true, movie: { select: { genres: { include: { genre: true } } } } },
      }),
    ]);
    const tally = (rows: typeof ratings1) => {
      const m = new Map<string, { count: number; sum: number }>();
      for (const r of rows) {
        for (const mg of r.movie.genres) {
          const e = m.get(mg.genre.name) ?? { count: 0, sum: 0 };
          e.count++; e.sum += r.ratistRating ?? 0;
          m.set(mg.genre.name, e);
        }
      }
      return m;
    };
    const g1 = tally(ratings1);
    const g2 = tally(ratings2);
    let topGenre: { name: string; count1: number; avg1: number; count2: number; avg2: number } | null = null;
    for (const [name, e1] of g1) {
      const e2 = g2.get(name);
      if (!e2) continue;
      const combined = e1.count + e2.count;
      if (!topGenre || combined > (topGenre.count1 + topGenre.count2)) {
        topGenre = {
          name,
          count1: e1.count, avg1: e1.sum / e1.count,
          count2: e2.count, avg2: e2.sum / e2.count,
        };
      }
    }

    const matchColor = overallMatch >= 80 ? "#22c55e" : overallMatch >= 60 ? "#eab308" : "#888888";
    const matchLabel = overallMatch >= 80 ? "Very similar taste" : overallMatch >= 60 ? "Good overlap" : "Different tastes";

    const avatar1 = user1.avatarUrl;
    const avatar2 = user2.avatarUrl;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: "24px 40px", alignItems: "center" }}>
          {/* Branding */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 10 }}>
            <img src={logoSrc} width={28} height={28} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 12, letterSpacing: 2 }}>THE RATIST</span>
          </div>

          <span style={{ color: "#555", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 14 }}>Taste Match</span>

          {/* Users + score */}
          <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {avatar1 ? (
                <img src={avatar1} width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 56, height: 56, borderRadius: 28, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontSize: 22, fontWeight: 900 }}>{user1.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>{user1.name}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ color: matchColor, fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{overallMatch}%</span>
              <span style={{ color: matchColor, fontSize: 13, fontWeight: 600 }}>{matchLabel}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {avatar2 ? (
                <img src={avatar2} width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 56, height: 56, borderRadius: 28, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontSize: 22, fontWeight: 900 }}>{user2.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>{user2.name}</span>
            </div>
          </div>

          {/* Category taste preferences — six rows of mirrored bars
              showing how each user weights the six rating categories.
              The center label is the category; user1's bar grows right-
              to-left, user2's grows left-to-right, so the difference is
              visually scannable at a glance. */}
          {user1.profile && user2.profile && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 620, marginBottom: 12 }}>
              {COMPONENT_KEYS.map((key) => {
                const s1 = p1[key] ?? 0;
                const s2 = p2[key] ?? 0;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* User1 bar (right-aligned) */}
                    <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                      <span style={{ color: scoreColor(s1), fontSize: 10, fontWeight: 700 }}>{s1.toFixed(1)}</span>
                      <div style={{ display: "flex", width: 200, height: 8, backgroundColor: "#222", borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" }}>
                        <div style={{ display: "flex", width: `${(s1 / 10) * 100}%`, height: "100%", backgroundColor: scoreColor(s1) }} />
                      </div>
                    </div>
                    {/* Label */}
                    <span style={{ color: "#888", fontSize: 10, fontWeight: 600, width: 64, textAlign: "center" }}>{COMPONENT_SHORT[key]}</span>
                    {/* User2 bar (left-aligned) */}
                    <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", width: 200, height: 8, backgroundColor: "#222", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ display: "flex", width: `${(s2 / 10) * 100}%`, height: "100%", backgroundColor: scoreColor(s2) }} />
                      </div>
                      <span style={{ color: scoreColor(s2), fontSize: 10, fontWeight: 700 }}>{s2.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top shared genre — single most co-rated genre, framed as
              "you both rated N {genre}s at avg X / Y". Falls back to a
              muted footer when there is no genre overlap (typically:
              one user has zero rated movies). */}
          {topGenre ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 16px", backgroundColor: "#141414", borderRadius: 8, marginTop: "auto" }}>
              <span style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const }}>Top Shared Genre</span>
              <span style={{ color: "white", fontSize: 16, fontWeight: 800 }}>{topGenre.name}</span>
              {/* Count stays neutral (white/grey) so only the average
                  rating carries the score-color signal. Coloring the
                  film count the same as the avg made it read like a
                  second rating. */}
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#d1d5db", fontSize: 13, fontWeight: 700 }}>{topGenre.count1}</span>
                <span style={{ color: "#555", fontSize: 12 }}>·</span>
                <span style={{ color: scoreColor(topGenre.avg1), fontSize: 13, fontWeight: 700 }}>{topGenre.avg1.toFixed(1)}</span>
              </span>
              <span style={{ color: "#555", fontSize: 12 }}>vs</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#d1d5db", fontSize: 13, fontWeight: 700 }}>{topGenre.count2}</span>
                <span style={{ color: "#555", fontSize: 12 }}>·</span>
                <span style={{ color: scoreColor(topGenre.avg2), fontSize: 13, fontWeight: 700 }}>{topGenre.avg2.toFixed(1)}</span>
              </span>
            </div>
          ) : (
            <span style={{ color: "#444", fontSize: 12, marginTop: "auto" }}>Find your taste match at theratist.com</span>
          )}

          {topGenre && (
            <span style={{ color: "#444", fontSize: 10, marginTop: 6 }}>theratist.com</span>
          )}
        </div>
      ),
      { width: 800, height: 450 }
    );
  } catch (err) {
    console.error("OG compare error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
