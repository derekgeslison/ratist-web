import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;
const RED = "#CC0033";

const COMPONENT_LABELS: Record<string, string> = {
  narrativeFocused: "Narrative",
  characterFocused: "Character",
  messageFocused: "Message",
  cinematicFocused: "Cinematic",
  performanceFocused: "Performance",
  entertainmentFocused: "Entertainment",
};

const GENRE_LABELS: Record<string, string> = {
  genreAction: "Action / Adventure",
  genreAnimation: "Animation",
  genreHorror: "Horror",
  genreDrama: "Drama",
  genreHistorical: "Historical",
  genreScifi: "Sci-Fi",
  genreThriller: "Thriller",
  genreComedy: "Comedy",
  genreBookAdapt: "Book Adaptation",
  genreFantasy: "Fantasy",
  genreRomance: "Romance",
  genreDocumentary: "Documentary",
  genreFamily: "Family",
  genreFilmNoir: "Film-Noir",
  genreMusical: "Musical",
  genreBiopic: "Biopic",
  genreCrime: "Crime",
  genreWestern: "Western",
  genreMystery: "Mystery",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true, bio: true, profile: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const [movieRated, movieSeen, movieAvg, tvRated, tvSeen, tvAvg, followerCount] =
      await Promise.all([
        prisma.movieRating.count({ where: { userId: user.id } }),
        prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
        prisma.movieRating.aggregate({
          where: { userId: user.id, ratistRating: { not: null } },
          _avg: { ratistRating: true },
          _count: { ratistRating: true },
        }),
        prisma.tVShowRating.count({ where: { userId: user.id, ratingScope: "series" } }),
        prisma.userFavoriteShow.count({ where: { userId: user.id } }),
        prisma.tVShowRating.aggregate({
          where: { userId: user.id, ratingScope: "series", ratistRating: { not: null } },
          _avg: { ratistRating: true },
          _count: { ratistRating: true },
        }),
        prisma.userFollow.count({ where: { followingId: user.id, status: "accepted" } }),
      ]);

    const totalRated = movieRated + tvRated;
    const totalSeen = movieSeen + tvSeen;
    // Combined weighted avg across movie + tv ratings
    const movieN = movieAvg._count.ratistRating ?? 0;
    const tvN = tvAvg._count.ratistRating ?? 0;
    const combinedN = movieN + tvN;
    const combinedAvg =
      combinedN === 0
        ? null
        : ((movieAvg._avg.ratistRating ?? 0) * movieN + (tvAvg._avg.ratistRating ?? 0) * tvN) /
          combinedN;

    // Components — all 6 bars, sorted desc by score for visual hierarchy
    const profile = user.profile;
    const components = profile
      ? Object.keys(COMPONENT_LABELS)
          .map((k) => ({ key: k, label: COMPONENT_LABELS[k], score: (profile as unknown as Record<string, number>)[k] ?? 0 }))
          .sort((a, b) => b.score - a.score)
      : [];

    // Genres — top 5 by score, score > 0 only
    const genres = profile
      ? Object.keys(GENRE_LABELS)
          .map((k) => ({ key: k, label: GENRE_LABELS[k], score: (profile as unknown as Record<string, number>)[k] ?? 0 }))
          .filter((g) => g.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
      : [];

    const hasProfileData = components.some((c) => c.score > 0) || genres.length > 0;

    const bioShort = user.bio ? (user.bio.length > 110 ? user.bio.slice(0, 108) + "…" : user.bio) : "";

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: W,
            height: H,
            backgroundColor: "#0a0a0a",
            position: "relative",
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 0,
              width: W,
              height: H,
              background: "linear-gradient(135deg, #1a0410 0%, #0a0a0a 60%)",
            }}
          />

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "22px 36px 0 36px",
              width: W,
            }}
          >
            <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1.5 }}>
              THE RATIST
            </span>
            <span style={{ color: "#555", fontSize: 13, marginLeft: 4 }}>·</span>
            <span style={{ color: "#888", fontSize: 13, letterSpacing: 2.5, textTransform: "uppercase" }}>
              PROFILE
            </span>
            <div style={{ display: "flex", flex: 1 }} />
            <span style={{ color: "#888", fontSize: 14, letterSpacing: 0.8, fontWeight: 600 }}>
              theratist.com/profile
            </span>
          </div>

          {/* Profile header row — 3 columns: avatar | name+bio | 2x2 stat tiles */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 50,
              top: 90,
              width: W - 100,
              alignItems: "center",
              gap: 24,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                display: "flex",
                width: 160,
                height: 160,
                borderRadius: 16,
                border: `4px solid ${RED}`,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 24px rgba(0,0,0,0.7), 0 0 18px rgba(204,0,51,0.35)",
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  width={160}
                  height={160}
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
              ) : (
                <span style={{ color: "white", fontSize: 70, fontWeight: 900 }}>
                  {user.name[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>

            {/* Name + bio (flex grows to fill middle) */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <span
                style={{
                  color: "white",
                  fontSize: 42,
                  fontWeight: 900,
                  lineHeight: 1.1,
                  textShadow: "0 2px 6px #000",
                }}
              >
                {user.name}
              </span>
              {bioShort && (
                <span
                  style={{
                    color: "#aaa",
                    fontSize: 15,
                    marginTop: 8,
                    lineHeight: 1.35,
                    maxWidth: 480,
                  }}
                >
                  {bioShort}
                </span>
              )}
            </div>

            {/* 2x2 stat tile grid on the right */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: 330,
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <StatTile value={String(totalRated)} label="RATED" />
                <StatTile value={String(totalSeen)} label="SEEN" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <StatTile
                  value={combinedAvg != null ? combinedAvg.toFixed(1) : "—"}
                  label="AVG RATING"
                  color={combinedAvg != null ? scoreHex(combinedAvg) : "#666"}
                />
                <StatTile
                  value={String(followerCount)}
                  label={followerCount === 1 ? "FOLLOWER" : "FOLLOWERS"}
                />
              </div>
            </div>
          </div>

          {/* Bars area — left column "WHAT MOVES YOU", right column "TOP GENRES" */}
          {hasProfileData ? (
            <>
              {/* LEFT — components */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 50,
                  top: 270,
                  width: 510,
                }}
              >
                <span
                  style={{
                    color: "#888",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 2.5,
                    marginBottom: 16,
                  }}
                >
                  WHAT MOVES YOU
                </span>
                {components.map((c) => (
                  <Bar key={c.key} label={c.label} score={c.score} />
                ))}
              </div>

              {/* RIGHT — top genres */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 620,
                  top: 270,
                  width: 530,
                }}
              >
                <span
                  style={{
                    color: "#888",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 2.5,
                    marginBottom: 16,
                  }}
                >
                  TOP GENRES
                </span>
                {genres.length > 0 ? (
                  genres.map((g) => (
                    <Bar key={g.key} label={g.label} score={g.score} />
                  ))
                ) : (
                  <span style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
                    No genre preferences yet — rate a few films to fill these in.
                  </span>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                left: 50,
                top: 290,
                width: W - 100,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#666", fontSize: 16, textAlign: "center", maxWidth: 600 }}>
                {user.name}&apos;s taste profile is still being built — rate a few films to see
                their cinematic fingerprint here.
              </span>
            </div>
          )}
        </div>
      ),
      { width: W, height: H }
    );
  } catch (err) {
    console.error("Profile OG error:", err);
    return new Response("Error generating image", { status: 500 });
  }
}

function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: 160,
        height: 75,
        backgroundColor: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
      }}
    >
      <span style={{ color: color ?? "white", fontSize: 30, fontWeight: 900, lineHeight: 1 }}>
        {value}
      </span>
      <span
        style={{
          color: "#888",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.8,
          marginTop: 6,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Bar({ label, score }: { label: string; score: number }) {
  // 0–10 scale → percentage of bar width. Color matches the site's profile
  // bar coloring (scoreHex / scoreColor): green ≥8, yellow ≥6, orange ≥4, red <4.
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const TRACK_W = 250;
  const color = score > 0 ? scoreHex(score) : "#444";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          color: "#ccc",
          fontSize: 14,
          fontWeight: 600,
          width: 165,
          lineHeight: 1.1,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          width: TRACK_W,
          height: 12,
          borderRadius: 6,
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: (TRACK_W * pct) / 100,
            height: 12,
            backgroundColor: color,
            borderRadius: 6,
          }}
        />
      </div>
      <span
        style={{
          color,
          fontSize: 14,
          fontWeight: 900,
          width: 38,
          textAlign: "right",
        }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}
