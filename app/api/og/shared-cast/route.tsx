import { ImageResponse } from "next/og";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const TMDB_KEY = process.env.TMDB_API_KEY;
const W = 1200;
const H = 630;
const RED = "#CC0033";
const CREAM = "#f5f1e8";

type SelectedKind = "movie" | "tv" | "person";

async function fetchTmdbImage(id: string, kind: SelectedKind): Promise<string | null> {
  if (!TMDB_KEY) return null;
  try {
    const endpoint =
      kind === "person"
        ? `https://api.themoviedb.org/3/person/${id}?api_key=${TMDB_KEY}`
        : kind === "tv"
        ? `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}`
        : `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    const path = kind === "person" ? data.profile_path : data.poster_path;
    return path ? `https://image.tmdb.org/t/p/w342${path}` : null;
  } catch {
    return null;
  }
}

interface Tier {
  level: number;
  count: number;
}

function parseTiers(raw: string): Tier[] {
  return raw
    .split(",")
    .filter(Boolean)
    .map((s) => {
      const [k, v] = s.split(":");
      return { level: parseInt(k, 10), count: parseInt(v, 10) };
    })
    .filter((t) => !isNaN(t.level) && !isNaN(t.count))
    .sort((a, b) => b.level - a.level);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "movies-to-people";
  const isPeopleMode = mode === "people-to-movies";

  const selectedNames = (searchParams.get("names") ?? "").split("|").filter(Boolean);
  const selectedIds = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const selectedTypes = (searchParams.get("types") ?? "").split(",").filter(Boolean);
  const sharedNames = (searchParams.get("sharedNames") ?? "").split("|").filter(Boolean);
  const sharedIds = (searchParams.get("sharedIds") ?? "").split(",").filter(Boolean);
  const sharedCounts = (searchParams.get("sharedCounts") ?? "")
    .split(",")
    .filter(Boolean)
    .map((n) => parseInt(n, 10));
  const tiers = parseTiers(searchParams.get("tiers") ?? "");
  const total = parseInt(searchParams.get("total") ?? "0", 10);
  const overlap = parseInt(searchParams.get("overlap") ?? "0", 10);
  const count = parseInt(searchParams.get("count") ?? "0", 10);
  const yearRange = searchParams.get("years") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const selectedKindFor = (i: number): SelectedKind => {
      if (isPeopleMode) return "person";
      const t = selectedTypes[i];
      return t === "tv" ? "tv" : "movie";
    };
    const sharedKind: SelectedKind = isPeopleMode ? "movie" : "person";

    const [selectedImgs, sharedImgs] = await Promise.all([
      Promise.all(selectedIds.map((id, i) => fetchTmdbImage(id, selectedKindFor(i)))),
      Promise.all(sharedIds.slice(0, 6).map((id) => fetchTmdbImage(id, sharedKind))),
    ]);

    const props = {
      logoSrc,
      selectedNames,
      selectedImgs,
      sharedNames,
      sharedImgs,
      sharedCounts,
      tiers,
      total,
      overlap,
      count,
      yearRange,
    };

    return new ImageResponse(isPeopleMode ? <BridgeCard {...props} /> : <ConspiracyCard {...props} />, {
      width: W,
      height: H,
    });
  } catch (err) {
    console.error("OG shared-cast error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

interface CardProps {
  logoSrc: string;
  selectedNames: string[];
  selectedImgs: (string | null)[];
  sharedNames: string[];
  sharedImgs: (string | null)[];
  sharedCounts: number[];
  tiers: Tier[];
  total: number;
  overlap: number;
  count: number;
  yearRange: string;
}

function tierLongLabel(level: number, total: number): string {
  if (total === 2 && level === 2) return "in both";
  if (level >= total) return `in all ${total}`;
  return `in ${level} of ${total}`;
}

function tierFeatureLabel(level: number, total: number): string {
  if (total === 2 && level === 2) return "feature both";
  if (level >= total) return `feature all ${total}`;
  return `feature ${level} of ${total}`;
}

function fractionLabel(level: number, total: number): string {
  return `${level}/${total}`;
}

// Rounded portrait card for a person — replaces the cropped circles.
// objectPosition: "top" preserves head; rounded rect avoids the circle edge clipping.
function PersonCard({
  img,
  name,
  width,
  height,
  borderWidth,
  countBadge,
  showName,
  nameSize,
}: {
  img: string | null;
  name: string;
  width: number;
  height: number;
  borderWidth: number;
  countBadge?: string;
  showName?: boolean;
  nameSize?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        alignItems: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          width,
          height,
          borderRadius: 14,
          border: `${borderWidth}px solid ${RED}`,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 22px rgba(0,0,0,0.7), 0 0 18px rgba(204,0,51,0.35)",
          position: "relative",
        }}
      >
        {img ? (
          <img
            src={img}
            width={width}
            height={height}
            style={{ objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <span style={{ color: "white", fontSize: width * 0.4, fontWeight: 900 }}>
            {name[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        {countBadge && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              bottom: 6,
              right: 6,
              padding: "3px 8px",
              backgroundColor: "rgba(10,10,10,0.92)",
              border: `2px solid ${RED}`,
              borderRadius: 999,
            }}
          >
            <span style={{ color: "white", fontSize: 11, fontWeight: 900, letterSpacing: 0.5 }}>
              {countBadge}
            </span>
          </div>
        )}
      </div>
      {showName && (
        <span
          style={{
            color: "white",
            fontSize: nameSize ?? 14,
            fontWeight: 700,
            marginTop: 8,
            maxWidth: width + 30,
            textAlign: "center",
            textShadow: "0 1px 4px #000",
            lineHeight: 1.1,
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

function Header({
  logoSrc,
  eyebrow,
}: {
  logoSrc: string;
  eyebrow: string;
}) {
  return (
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
      <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1.5 }}>THE RATIST</span>
      <span style={{ color: "#555", fontSize: 13, marginLeft: 4 }}>·</span>
      <span style={{ color: "#888", fontSize: 13, letterSpacing: 2.5, textTransform: "uppercase" }}>{eyebrow}</span>
      <div style={{ display: "flex", flex: 1 }} />
      <span style={{ color: "#888", fontSize: 14, letterSpacing: 0.8, fontWeight: 600 }}>
        theratist.com/tools/shared-cast
      </span>
    </div>
  );
}

function FooterStrip({ filterChip }: { filterChip?: string | null }) {
  if (!filterChip) return null;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: 20,
        left: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "5px 12px",
          backgroundColor: "rgba(204,0,51,0.15)",
          border: `1px solid ${RED}`,
          borderRadius: 999,
        }}
      >
        <span style={{ color: RED, fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>{filterChip}</span>
      </div>
    </div>
  );
}

// =====================================================================
// CONSPIRACY PINBOARD — Movies/Shows → People
// =====================================================================
function ConspiracyCard({
  logoSrc,
  selectedNames,
  selectedImgs,
  sharedNames,
  sharedImgs,
  sharedCounts,
  tiers,
  total,
  overlap,
  count,
}: CardProps) {
  const POSTER_W = 144;
  const POSTER_H = 216;

  // 3-poster slots: top-row (left/center/right) so the cluster has the lower
  // portion to itself and threads point downward rather than colliding.
  // 2-poster: side-by-side at upper-mid. 4-poster: classic 4 corners.
  const SLOT_SETS: Record<number, Array<{ x: number; y: number; rot: number }>> = {
    2: [
      { x: 70, y: 200, rot: -8 },
      { x: W - 70 - POSTER_W, y: 200, rot: 7 },
    ],
    3: [
      { x: 70, y: 95, rot: -7 },
      { x: W / 2 - POSTER_W / 2, y: 78, rot: -1 },
      { x: W - 70 - POSTER_W, y: 95, rot: 7 },
    ],
    4: [
      { x: 70, y: 95, rot: -7 },
      { x: W - 70 - POSTER_W, y: 95, rot: 6 },
      { x: 70, y: 380, rot: 5 },
      { x: W - 70 - POSTER_W, y: 380, rot: -6 },
    ],
  };

  // Cluster center varies by poster count to avoid collision.
  // For 2 posters (mid-y), cluster sits below them.
  // For 3 posters (top row), cluster sits in lower 60% of canvas.
  // For 4 posters (corners), cluster sits dead center.
  const CENTER_BY_N: Record<number, { x: number; y: number }> = {
    2: { x: W / 2, y: 380 },
    3: { x: W / 2, y: 410 },
    4: { x: W / 2, y: 320 },
  };

  const n = Math.min(4, Math.max(2, selectedImgs.length));
  const slots = SLOT_SETS[n] ?? SLOT_SETS[4];
  const CENTER = CENTER_BY_N[n] ?? CENTER_BY_N[4];

  const posters = selectedImgs.slice(0, n).map((img, i) => ({
    img,
    name: selectedNames[i] ?? "",
    ...slots[i],
  }));

  // Position lines by their MIDPOINT so the default center-rotation lands the
  // endpoints exactly at poster center and cluster center. (Satori doesn't honor
  // transformOrigin reliably — using midpoint geometry sidesteps that entirely.)
  const threads = posters.map((p) => {
    const px = p.x + POSTER_W / 2;
    const py = p.y + POSTER_H / 2;
    const dx = CENTER.x - px;
    const dy = CENTER.y - py;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      mx: (px + CENTER.x) / 2,
      my: (py + CENTER.y) / 2,
      length,
      angle,
    };
  });

  // Cluster — max 3 face cards. Hero on top, supporting cards beside/below.
  const facesToShow = sharedImgs.slice(0, 3).map((img, i) => ({
    img,
    name: sharedNames[i] ?? "",
    count: sharedCounts[i] ?? 0,
  }));
  const numFaces = facesToShow.length;
  const extraTopMatches = Math.max(0, sharedNames.length - numFaces);

  // Card sizes & positions per cluster size
  type Pos = { x: number; y: number; w: number; h: number; idx: number };
  const positions: Pos[] = [];
  if (numFaces === 1) {
    const w = 150,
      h = 210;
    positions.push({ x: CENTER.x - w / 2, y: CENTER.y - h / 2, w, h, idx: 0 });
  } else if (numFaces === 2) {
    const w = 130,
      h = 180,
      gap = 18;
    positions.push({ x: CENTER.x - w - gap / 2, y: CENTER.y - h / 2, w, h, idx: 0 });
    positions.push({ x: CENTER.x + gap / 2, y: CENTER.y - h / 2, w, h, idx: 1 });
  } else {
    // 3 faces: hero on top, two smaller below
    const heroW = 130,
      heroH = 180;
    const subW = 100,
      subH = 140;
    const vGap = 14;
    positions.push({
      x: CENTER.x - heroW / 2,
      y: CENTER.y - heroH / 2 - 12,
      w: heroW,
      h: heroH,
      idx: 0,
    });
    positions.push({
      x: CENTER.x - heroW / 2 - subW - 8,
      y: CENTER.y + heroH / 2 - subH + vGap,
      w: subW,
      h: subH,
      idx: 1,
    });
    positions.push({
      x: CENTER.x + heroW / 2 + 8,
      y: CENTER.y + heroH / 2 - subH + vGap,
      w: subW,
      h: subH,
      idx: 2,
    });
  }

  const clusterBottom = Math.max(...positions.map((p) => p.y + p.h));

  const filterChip = overlap > 0 && overlap < total ? `AT LEAST ${overlap} OF ${total}` : null;
  const visibleTiers = tiers.slice(0, 3);

  // Names line — combine cluster face names compactly, with overflow indicator
  const namesLine = facesToShow
    .map((f) => f.name)
    .filter(Boolean)
    .join("  ·  ");
  const namesSuffix = extraTopMatches > 0 ? `  +${extraTopMatches}` : "";

  return (
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
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          background: "linear-gradient(135deg, #1a0410 0%, #0a0a0a 55%)",
        }}
      />

      <Header logoSrc={logoSrc} eyebrow="SHARED CAST & CREW" />

      {/* Threads — solid red at poster end fades toward cluster.
          Gradient direction (left→right of element) flips with rotation,
          but the line endpoints are correct because we position by midpoint. */}
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H }}>
        {threads.map((t, i) => {
          // After rotation, the element's "left edge" maps to the END that is
          // OPPOSITE the angle direction. For lines pointing rightward (angle in
          // [-90,90]), left edge is at the poster end → put solid red there.
          // For lines pointing leftward, the left edge ends up at the cluster end,
          // so we flip the gradient.
          const pointsRightward = Math.abs(t.angle) <= 90;
          const grad = pointsRightward
            ? "linear-gradient(to right, rgba(204,0,51,0.95) 0%, rgba(204,0,51,0.55) 60%, rgba(204,0,51,0.0) 100%)"
            : "linear-gradient(to right, rgba(204,0,51,0.0) 0%, rgba(204,0,51,0.55) 40%, rgba(204,0,51,0.95) 100%)";
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: t.mx - t.length / 2,
                top: t.my - 1,
                width: t.length,
                height: 2,
                background: grad,
                transform: `rotate(${t.angle}deg)`,
              }}
            />
          );
        })}
      </div>

      {/* Posters */}
      {posters.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            position: "absolute",
            left: p.x,
            top: p.y,
            width: POSTER_W,
            height: POSTER_H,
            transform: `rotate(${p.rot}deg)`,
            boxShadow: "0 14px 34px rgba(0,0,0,0.7)",
            border: `5px solid ${CREAM}`,
            backgroundColor: "#1a1a1a",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {p.img ? (
            <img src={p.img} width={POSTER_W - 10} height={POSTER_H - 10} style={{ objectFit: "cover" }} />
          ) : (
            <span style={{ color: "#888", fontSize: 13, padding: 8, textAlign: "center" }}>{p.name}</span>
          )}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: -10,
              left: POSTER_W / 2 - 10,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: RED,
              boxShadow: "0 3px 6px rgba(0,0,0,0.6), inset -2px -2px 4px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      ))}

      {/* Cluster — portrait cards (no more circle-cropping faces) */}
      {positions.map((pos) => {
        const f = facesToShow[pos.idx];
        if (!f) return null;
        return (
          <div
            key={pos.idx}
            style={{
              display: "flex",
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: pos.w,
              height: pos.h,
            }}
          >
            <PersonCard
              img={f.img}
              name={f.name}
              width={pos.w}
              height={pos.h}
              borderWidth={pos.idx === 0 ? 5 : 4}
              countBadge={fractionLabel(f.count, total)}
            />
          </div>
        );
      })}

      {/* Names line + tier breakdown — sits above footer strip */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 0,
          top: Math.max(clusterBottom + 18, H - 130),
          width: W,
          alignItems: "center",
        }}
      >
        {namesLine && (
          <span
            style={{
              color: "white",
              fontSize: numFaces === 1 ? 24 : 19,
              fontWeight: 900,
              textShadow: "0 2px 8px #000, 0 0 14px #000",
              maxWidth: 980,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {namesLine}
            {namesSuffix && <span style={{ color: "#888", fontWeight: 700 }}>{namesSuffix}</span>}
          </span>
        )}
        {visibleTiers.length > 0 ? (
          <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "baseline" }}>
            {visibleTiers.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    color: t.level >= total ? RED : "white",
                    fontSize: 20,
                    fontWeight: 900,
                  }}
                >
                  {t.count}
                </span>
                <span style={{ color: "#999", fontSize: 13, fontWeight: 600 }}>
                  {tierLongLabel(t.level, total)}
                </span>
                {i < visibleTiers.length - 1 && (
                  <span style={{ color: "#444", fontSize: 13, marginLeft: 10, marginRight: 6 }}>·</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: "#999", fontSize: 14, marginTop: 8 }}>{count} shared cast & crew</span>
        )}
      </div>

      <FooterStrip filterChip={filterChip} />
    </div>
  );
}

// =====================================================================
// BRIDGE — People → Movies/Shows
// Layout swapped per feedback: stat panel on LEFT, actor column on RIGHT.
// Actor cards are now rounded rectangles (no circle crop), capped at 5 visible.
// =====================================================================
function BridgeCard({
  logoSrc,
  selectedNames,
  selectedImgs,
  sharedNames,
  sharedImgs,
  sharedCounts,
  tiers,
  total,
  overlap,
  count,
  yearRange,
}: CardProps) {
  // All selected faces visible (filter chip moved out of header, so no top-right
  // crowding; column height scales with count so even 6 actors fit cleanly).
  const visibleFaces = selectedImgs;
  const visiblePosters = sharedImgs.slice(0, 5);

  const numFaces = visibleFaces.length;
  const FACE_H =
    numFaces >= 6 ? 80 :
    numFaces === 5 ? 94 :
    numFaces === 4 ? 110 :
    numFaces === 3 ? 126 : 144;
  const FACE_W = Math.round(FACE_H * 0.74);
  const FACE_GAP = numFaces >= 6 ? 6 : numFaces === 5 ? 8 : numFaces === 4 ? 12 : 16;

  const facesColumnHeight = numFaces * FACE_H + (numFaces - 1) * FACE_GAP;
  // Header bottom ≈ 60. Footer strip top ≈ 600. Center column in between.
  const facesTop = Math.max(72, 60 + (550 - facesColumnHeight) / 2);

  const BRIDGE_TOP = 360;
  const BRIDGE_HEIGHT = 56;

  const filterChip = overlap > 0 && overlap < total ? `AT LEAST ${overlap} OF ${total}` : null;
  const visibleTiers = tiers.slice(0, 3);

  // Tier visual on bridge: bigger + red border for full-match, smaller + cream for partial
  const posterMeta = visiblePosters.map((img, i) => {
    const c = sharedCounts[i] ?? 0;
    const isFull = c >= total && total > 0;
    return {
      img,
      name: sharedNames[i] ?? "",
      count: c,
      isFull,
      width: isFull ? 124 : 96,
      height: isFull ? 186 : 144,
    };
  });

  return (
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

      <Header logoSrc={logoSrc} eyebrow="SHARED FILMOGRAPHY" />

      {/* Bridge band */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: BRIDGE_TOP,
          width: W,
          height: BRIDGE_HEIGHT,
          background:
            "linear-gradient(to right, rgba(204,0,51,0) 0%, rgba(204,0,51,0.92) 18%, rgba(204,0,51,0.92) 82%, rgba(204,0,51,0) 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: BRIDGE_TOP,
          width: W,
          height: 2,
          background:
            "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: BRIDGE_TOP + BRIDGE_HEIGHT - 2,
          width: W,
          height: 2,
          background:
            "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* LEFT — stat panel (count + tier list + years) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 40,
          top: 110,
          width: 240,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ color: RED, fontSize: 78, fontWeight: 900, lineHeight: 0.95 }}>{count}</span>
          <span style={{ color: "white", fontSize: 16, fontWeight: 800, letterSpacing: 1.4 }}>SHARED</span>
        </div>
        <div
          style={{
            display: "flex",
            width: 160,
            height: 2,
            background: "linear-gradient(to right, rgba(255,255,255,0.35), rgba(255,255,255,0))",
            marginTop: 12,
            marginBottom: 14,
          }}
        />
        {visibleTiers.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {visibleTiers.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span
                  style={{
                    color: t.level >= total ? RED : "white",
                    fontSize: 19,
                    fontWeight: 900,
                  }}
                >
                  {t.count}
                </span>
                <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>
                  {tierFeatureLabel(t.level, total)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: "#888", fontSize: 13 }}>shared titles</span>
        )}
        {yearRange && (
          <div
            style={{
              display: "flex",
              marginTop: 18,
              padding: "5px 12px",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              alignSelf: "flex-start",
            }}
          >
            <span style={{ color: "#ccc", fontSize: 11, letterSpacing: 1.4 }}>{yearRange}</span>
          </div>
        )}
      </div>

      {/* CENTER — posters riding the bridge */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 305,
          top: BRIDGE_TOP + BRIDGE_HEIGHT / 2 - 100,
          width: 590,
          height: 200,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {posterMeta.map((p, i) => {
          const offsets = [-4, 4, -2, 6, -4];
          const rotations = [-3, 2, -1, 3, -2];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                position: "relative",
                width: p.width,
                height: p.height,
                marginTop: offsets[i] ?? 0,
                transform: `rotate(${rotations[i] ?? 0}deg)`,
                border: p.isFull ? `4px solid ${RED}` : `3px solid ${CREAM}`,
                boxShadow: p.isFull
                  ? "0 12px 28px rgba(0,0,0,0.75), 0 0 22px rgba(204,0,51,0.45)"
                  : "0 8px 18px rgba(0,0,0,0.7)",
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                opacity: p.isFull ? 1 : 0.92,
              }}
            >
              {p.img ? (
                <img src={p.img} width={p.width} height={p.height} style={{ objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#888", fontSize: 11, padding: 6, textAlign: "center" }}>{p.name}</span>
              )}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  top: 6,
                  right: 6,
                  padding: "2px 7px",
                  backgroundColor: p.isFull ? RED : "rgba(0,0,0,0.85)",
                  border: p.isFull ? "1px solid rgba(255,255,255,0.4)" : `1px solid ${RED}`,
                  borderRadius: 999,
                }}
              >
                <span style={{ color: "white", fontSize: 10, fontWeight: 900, letterSpacing: 0.5 }}>
                  {fractionLabel(p.count, total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* RIGHT — actor column (rounded portrait cards, no more cropped circles) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          right: 40,
          top: facesTop,
          width: 240,
          gap: FACE_GAP,
          alignItems: "flex-end",
        }}
      >
        {visibleFaces.map((img, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                color: "white",
                fontSize: numFaces >= 5 ? 14 : 16,
                fontWeight: 700,
                maxWidth: 152,
                textAlign: "right",
                lineHeight: 1.15,
              }}
            >
              {selectedNames[i]}
            </span>
            <div
              style={{
                display: "flex",
                width: FACE_W,
                height: FACE_H,
                borderRadius: 12,
                border: `3px solid ${RED}`,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 18px rgba(0,0,0,0.7), 0 0 14px rgba(204,0,51,0.3)",
              }}
            >
              {img ? (
                <img
                  src={img}
                  width={FACE_W}
                  height={FACE_H}
                  style={{ objectFit: "cover", objectPosition: "top" }}
                />
              ) : (
                <span style={{ color: "white", fontSize: FACE_W * 0.4, fontWeight: 900 }}>
                  {selectedNames[i]?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <FooterStrip filterChip={filterChip} />
    </div>
  );
}
