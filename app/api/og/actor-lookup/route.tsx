import { ImageResponse } from "next/og";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;
const RED = "#CC0033";
const CREAM = "#f5f1e8";

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";
const POSTER_BASE_SMALL = "https://image.tmdb.org/t/p/w185";

function tmdbImg(path: string, size: "lg" | "sm" = "lg"): string | null {
  if (!path) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${size === "lg" ? POSTER_BASE : POSTER_BASE_SMALL}${p}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const personName = searchParams.get("name") ?? "Unknown";
  const dept = (searchParams.get("dept") ?? "Actor").toUpperCase();
  const personPoster = searchParams.get("personPoster") ?? "";
  const userName = searchParams.get("userName") ?? "";
  const count = parseInt(searchParams.get("count") ?? "0", 10);
  const movies = parseInt(searchParams.get("movies") ?? "0", 10);
  const shows = parseInt(searchParams.get("shows") ?? "0", 10);
  const avgRaw = searchParams.get("avg");
  const avg = avgRaw ? parseFloat(avgRaw) : null;

  const heroPoster = searchParams.get("heroPoster") ?? "";
  const heroTitle = searchParams.get("heroTitle") ?? "";
  const heroRatingRaw = searchParams.get("heroRating") ?? "";
  const heroRating = heroRatingRaw ? parseFloat(heroRatingRaw) : null;
  // When the user hasn't rated any of this person's films, the hero pick is
  // the highest community-rated one in their seen pile. Labels switch to
  // "COMMUNITY PICK" / "COMMUNITY RATING" and the rating chip color still
  // reflects the score (red→green) since it's still a meaningful number.
  const heroIsCommunity = searchParams.get("heroIsCommunity") === "1";

  const tailPosters = (searchParams.get("tailPosters") ?? "").split("|");
  const tailRatings = (searchParams.get("tailRatings") ?? "")
    .split(",")
    .map((r) => (r === "-" || r === "" ? null : parseFloat(r)));
  const tailHidden = parseInt(searchParams.get("tailHidden") ?? "0", 10);

  try {
    const logoSrc = getLogoBase64();
    const personImg = tmdbImg(personPoster);
    const heroImg = tmdbImg(heroPoster);

    // Compose count line: "12 movies and 2 shows" / "14 movies" / etc
    const countLine = [
      movies > 0 ? `${movies} movie${movies !== 1 ? "s" : ""}` : null,
      shows > 0 ? `${shows} show${shows !== 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(" + ");

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
              KNOWN FROM
            </span>
            <div style={{ display: "flex", flex: 1 }} />
            <span style={{ color: "#888", fontSize: 14, letterSpacing: 0.8, fontWeight: 600 }}>
              theratist.com/tools/actor-lookup
            </span>
          </div>

          {/* LEFT — person card + meta (nudged right to tighten the middle gap) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              left: 80,
              top: 90,
              width: 200,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 200,
                height: 290,
                borderRadius: 16,
                border: `4px solid ${RED}`,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 28px rgba(0,0,0,0.7), 0 0 22px rgba(204,0,51,0.35)",
              }}
            >
              {personImg ? (
                <img
                  src={personImg}
                  width={200}
                  height={290}
                  style={{ objectFit: "cover", objectPosition: "top" }}
                />
              ) : (
                <span style={{ color: "white", fontSize: 84, fontWeight: 900 }}>
                  {personName[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
            <span
              style={{
                color: "white",
                fontSize: 26,
                fontWeight: 900,
                marginTop: 14,
                lineHeight: 1.05,
                maxWidth: 220,
              }}
            >
              {personName}
            </span>
            <span
              style={{
                color: "#888",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                marginTop: 6,
              }}
            >
              {dept}
            </span>
          </div>

          {/* CENTER — hero details (right-aligned, leans into the poster on its right).
              Title font tiered by length so "Pirates of the Caribbean: …" still fits
              within the bounded text block without crashing into the actor card or poster. */}
          {(() => {
            // Title size tier — bounded to a 510px-wide column. Allows up to 3 lines.
            const titleLen = heroTitle.length;
            const titleSize = titleLen <= 22 ? 46 : titleLen <= 36 ? 38 : 32;
            const eyebrowText = heroIsCommunity ? "COMMUNITY PICK" : "YOUR PICK";
            const ratingLabel = heroIsCommunity ? "COMMUNITY RATING" : "YOUR RATING";
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 320,
                  top: 110,
                  width: 510,
                  alignItems: "flex-end",
                }}
              >
                <span
                  style={{
                    color: RED,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: 2.5,
                  }}
                >
                  {eyebrowText}
                </span>
                <span
                  style={{
                    color: "white",
                    fontSize: titleSize,
                    fontWeight: 900,
                    lineHeight: 1.05,
                    marginTop: 10,
                    maxWidth: 510,
                    textShadow: "0 2px 6px #000",
                    textAlign: "right",
                  }}
                >
                  {heroTitle || "—"}
                </span>

                {heroRating != null ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      marginTop: 24,
                      alignItems: "flex-end",
                    }}
                  >
                    <span
                      style={{
                        color: scoreHex(heroRating),
                        fontSize: 96,
                        fontWeight: 900,
                        lineHeight: 0.95,
                        textShadow: "0 4px 14px rgba(0,0,0,0.7)",
                      }}
                    >
                      {heroRating.toFixed(1)}
                    </span>
                    <span
                      style={{
                        color: "#888",
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 2.5,
                        marginTop: 6,
                      }}
                    >
                      {ratingLabel}
                    </span>
                  </div>
                ) : (
                  <span
                    style={{
                      color: "#aaa",
                      fontSize: 15,
                      marginTop: 22,
                      maxWidth: 480,
                      lineHeight: 1.35,
                      textAlign: "right",
                    }}
                  >
                    No community rating yet — but {countLine || `${count} title${count !== 1 ? "s" : ""}`} in
                    the seen pile.
                  </span>
                )}
              </div>
            );
          })()}

          {/* RIGHT — hero poster (nudged left to close the middle gap) */}
          {heroImg ? (
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 860,
                top: 90,
                width: 240,
                height: 360,
                border: `5px solid ${CREAM}`,
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 18px 42px rgba(0,0,0,0.8)",
                overflow: "hidden",
              }}
            >
              <img src={heroImg} width={230} height={350} style={{ objectFit: "cover" }} />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 860,
                top: 90,
                width: 240,
                height: 360,
                border: `5px solid ${CREAM}`,
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 18px 42px rgba(0,0,0,0.8)",
              }}
            >
              <span style={{ color: "#666", fontSize: 14, padding: 12, textAlign: "center" }}>
                {heroTitle}
              </span>
            </div>
          )}

          {/* Stat strip — count + avg, just above the tail */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 80,
              top: 470,
              width: W - 160,
              alignItems: "center",
              gap: 18,
            }}
          >
            <span style={{ color: RED, fontSize: 50, fontWeight: 900, lineHeight: 1 }}>{count}</span>
            <span style={{ color: "white", fontSize: 20, fontWeight: 700 }}>
              {countLine || "title"} {userName ? `${userName} has` : "you've"} seen with {personName}
            </span>
            {avg != null && (
              <>
                <span style={{ color: "#444", fontSize: 22, marginLeft: 6, marginRight: 6 }}>·</span>
                <span style={{ color: "white", fontSize: 16, fontWeight: 600 }}>avg</span>
                <span style={{ color: scoreHex(avg), fontSize: 28, fontWeight: 900 }}>
                  {avg.toFixed(1)}
                </span>
              </>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 80,
              top: 535,
              width: W - 160,
              height: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          />

          {/* TAIL strip — small posters with rating chips */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 80,
              top: 548,
              width: W - 160,
              height: 80,
              alignItems: "center",
              gap: 6,
            }}
          >
            {tailPosters.slice(0, 13).map((p, i) => {
              const url = tmdbImg(p, "sm");
              const rating = tailRatings[i] ?? null;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    position: "relative",
                    width: 53,
                    height: 80,
                    border: "2px solid rgba(245,241,232,0.4)",
                    backgroundColor: "#1a1a1a",
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {url ? (
                    <img src={url} width={53} height={80} style={{ objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: "#666", fontSize: 9, padding: 2, textAlign: "center" }}>?</span>
                  )}
                  {rating != null && (
                    <div
                      style={{
                        display: "flex",
                        position: "absolute",
                        bottom: 2,
                        right: 2,
                        padding: "1px 4px",
                        backgroundColor: "rgba(10,10,10,0.92)",
                        border: `1px solid ${scoreHex(rating)}`,
                        borderRadius: 4,
                      }}
                    >
                      <span style={{ color: scoreHex(rating), fontSize: 9, fontWeight: 900 }}>
                        {rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {tailHidden > 0 && (
              <div
                style={{
                  display: "flex",
                  width: 53,
                  height: 80,
                  border: "2px dashed rgba(245,241,232,0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 4,
                }}
              >
                <span style={{ color: "#888", fontSize: 13, fontWeight: 800 }}>+{tailHidden}</span>
              </div>
            )}
          </div>
        </div>
      ),
      { width: W, height: H }
    );
  } catch (err) {
    console.error("OG actor-lookup error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
