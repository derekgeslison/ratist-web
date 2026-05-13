import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;
const RED = "#CC0033";
const CREAM = "#f5f1e8";

// w185 is plenty for the 138×207 render size and avoids the next/og fetch
// timeouts that occasionally produce blank tiles at w342 (the larger image
// also bloats memory inside Satori). Base64 prefetch was tried briefly but
// crashed the route by overloading the SVG payload Satori embeds.
const POSTER_BASE = "https://image.tmdb.org/t/p/w185";

function tmdbPoster(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${POSTER_BASE}${p}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid") ?? "";
  const slug = searchParams.get("slug") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const curator = await prisma.user.findUnique({
      where: { firebaseUid: uid },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!curator) return new Response("Curator not found", { status: 404 });

    const collection = await prisma.customCollection.findFirst({
      where: {
        userId: curator.id,
        slug,
        visibility: "public",
        publishedAt: { not: null },
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          select: { tmdbId: true, title: true, posterPath: true, mediaType: true },
        },
        tags: { orderBy: { tag: "asc" }, select: { tag: true }, take: 5 },
        themePrompt: { select: { title: true } },
      },
    });
    if (!collection) return new Response("Collection not found", { status: 404 });

    const totalItems = collection.items.length;
    const MAX_VISIBLE_POSTERS = 7;
    const visible = collection.items.slice(0, MAX_VISIBLE_POSTERS);
    const hidden = Math.max(0, totalItems - visible.length);
    const POSTER_W = 138;
    const POSTER_H = 207;

    // Eyebrow priority: official → theme → generic
    const eyebrow = collection.isOfficial
      ? "OFFICIAL COLLECTION"
      : collection.themePrompt
      ? `THEME · ${collection.themePrompt.title.toUpperCase()}`
      : "COLLECTION";

    // Title sizing — fits long titles into the available width
    const titleLen = collection.name.length;
    const titleSize = titleLen <= 26 ? 56 : titleLen <= 42 ? 44 : titleLen <= 60 ? 36 : 30;

    // Description — short truncation, only used as a quiet subtitle line
    const desc = collection.description ?? "";
    const descShort = desc.length > 130 ? desc.slice(0, 128) + "…" : desc;

    const tagList = collection.tags.map((t) => t.tag).slice(0, 4);

    const attribution = collection.isOfficial ? "The Ratist" : curator.name;

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
              {eyebrow}
            </span>
            <div style={{ display: "flex", flex: 1 }} />
            <span style={{ color: "#888", fontSize: 14, letterSpacing: 0.8, fontWeight: 600 }}>
              theratist.com/collections
            </span>
          </div>

          {/* Title + curator */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              left: 50,
              top: 90,
              width: W - 100,
            }}
          >
            <span
              style={{
                color: "white",
                fontSize: titleSize,
                fontWeight: 900,
                lineHeight: 1.05,
                textShadow: "0 2px 8px #000",
                maxWidth: W - 100,
              }}
            >
              {collection.name}
            </span>

            {/* Curator row — official collections show the Ratist logo;
                user-curated show the curator's avatar. Rounded square avoids
                the next/og circle-clipping issue (image corners poke out
                when borderRadius is set on the wrapper but not the img). */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  border: `2px solid ${RED}`,
                  overflow: "hidden",
                  backgroundColor: "#1a1a1a",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {collection.isOfficial ? (
                  <img
                    src={logoSrc}
                    width={38}
                    height={38}
                    style={{ objectFit: "cover", borderRadius: 8 }}
                  />
                ) : curator.avatarUrl ? (
                  <img
                    src={curator.avatarUrl}
                    width={38}
                    height={38}
                    style={{ objectFit: "cover", borderRadius: 8 }}
                  />
                ) : (
                  <span style={{ color: "white", fontSize: 18, fontWeight: 900 }}>
                    {attribution[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ color: "#bbb", fontSize: 16, fontWeight: 600 }}>Curated by</span>
                <span style={{ color: "white", fontSize: 16, fontWeight: 800 }}>{attribution}</span>
              </div>
            </div>

            {descShort && (
              <span
                style={{
                  color: "#888",
                  fontSize: 14,
                  marginTop: 12,
                  lineHeight: 1.4,
                  maxWidth: 980,
                  fontStyle: "italic",
                }}
              >
                “{descShort}”
              </span>
            )}
          </div>

          {/* Poster wall — vertically positioned to leave room for footer stats */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 320,
              width: W,
              height: POSTER_H,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            {visible.map((item, i) => {
              const url = tmdbPoster(item.posterPath);
              const rotations = [-3, 2, -1, 0, 1, -2, 3];
              const offsets = [-4, 4, -2, 0, 2, -4, 4];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: POSTER_W,
                    height: POSTER_H,
                    marginTop: offsets[i] ?? 0,
                    transform: `rotate(${rotations[i] ?? 0}deg)`,
                    border: `4px solid ${CREAM}`,
                    backgroundColor: "#1a1a1a",
                    boxShadow: "0 14px 30px rgba(0,0,0,0.7)",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {url ? (
                    <img src={url} width={POSTER_W} height={POSTER_H} style={{ objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: "#666", fontSize: 11, padding: 8, textAlign: "center" }}>
                      {item.title}
                    </span>
                  )}
                </div>
              );
            })}
            {hidden > 0 && (
              <div
                style={{
                  display: "flex",
                  width: POSTER_W,
                  height: POSTER_H,
                  marginTop: 0,
                  border: `4px dashed rgba(245,241,232,0.35)`,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <span style={{ color: "white", fontSize: 36, fontWeight: 900 }}>+{hidden}</span>
                <span
                  style={{
                    color: "#888",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                    marginTop: 4,
                  }}
                >
                  MORE
                </span>
              </div>
            )}
          </div>

          {/* Footer — title count + saves + tags */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              bottom: 26,
              width: W,
              paddingLeft: 36,
              paddingRight: 36,
              alignItems: "center",
            }}
          >
            {/* Footer stats — each stat (number + label) is wrapped in its
                own inner flex row so the baseline alignment is *forced*
                identically for both stats. Earlier they were siblings in a
                single flex row, which let Satori interpret each label's
                vertical position independently and SAVE drifted up. */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
              <FooterStat number={totalItems} label={totalItems === 1 ? "TITLE" : "TITLES"} />
              {collection.saveCount > 0 && (
                <>
                  <span style={{ color: "#555", fontSize: 14, marginLeft: 16, marginRight: 16 }}>·</span>
                  <FooterStat
                    number={collection.saveCount}
                    label={collection.saveCount === 1 ? "SAVE" : "SAVES"}
                  />
                </>
              )}
            </div>

            <div style={{ display: "flex", flex: 1 }} />

            {tagList.length > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {tagList.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      padding: "4px 10px",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 999,
                    }}
                  >
                    <span style={{ color: "#ccc", fontSize: 11, fontWeight: 700 }}>#{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
      { width: W, height: H }
    );
  } catch (err) {
    console.error("OG collection error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

// Self-contained number+label group. Wrapping each stat in its own flex
// row guarantees Satori treats them identically when nested inside the
// parent footer row, so the labels can't drift to different vertical
// positions across stats.
function FooterStat({ number, label }: { number: number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "baseline" }}>
      <span style={{ color: RED, fontSize: 22, fontWeight: 900, marginRight: 8 }}>{number}</span>
      <span style={{ color: "white", fontSize: 14, fontWeight: 700, letterSpacing: 1.5 }}>
        {label}
      </span>
    </div>
  );
}
