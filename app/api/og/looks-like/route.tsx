import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { OG_W, OG_H, OgHeader, OgEmptyState, VoteStats, RED, CREAM } from "@/lib/og-community";

export const dynamic = "force-dynamic";

const TMDB_PROFILE = "https://image.tmdb.org/t/p/w342";

export async function GET() {
  try {
    const logoSrc = getLogoBase64();
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const recent = await prisma.looksLike.findMany({
      where: { createdAt: { gte: since } },
      include: { votes: { select: { value: true } } },
    });
    const enrich = <T extends { votes: { value: number }[] }>(l: T) => ({
      ...l,
      total: l.votes.length,
      net: l.votes.reduce((s, v) => s + v.value, 0),
    });
    let scored = recent.map(enrich).sort((a, b) => b.net - a.net || +b.createdAt - +a.createdAt);
    let top = scored[0];

    if (!top) {
      const fallback = await prisma.looksLike.findMany({
        include: { votes: { select: { value: true } } },
      });
      scored = fallback.map(enrich).sort((a, b) => b.net - a.net);
      top = scored[0];
    }

    const FACE_W = 260;
    const FACE_H = 320;
    const FACE_Y = 200;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: OG_W,
            height: OG_H,
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
              width: OG_W,
              height: OG_H,
              background: "linear-gradient(135deg, #1a0410 0%, #0a0a0a 60%)",
            }}
          />

          <OgHeader logoSrc={logoSrc} eyebrow="LOOKS LIKE" url="theratist.com/community/looks-like" />

          {top ? (
            <>
              {/* Score row — above the actor cards, single line with total +
                  net + prompt. Centered horizontally. */}
              {(() => {
                const netColor = top.net > 0 ? "#22c55e" : top.net < 0 ? "#ef4444" : "#888";
                return (
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: 0,
                      top: 100,
                      width: OG_W,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ color: RED, fontSize: 56, fontWeight: 900 }}>{top.total}</span>
                    <span style={{ color: "white", fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>
                      {top.total === 1 ? "VOTE" : "VOTES"}
                    </span>
                    <span style={{ color: "#444", fontSize: 28, marginLeft: 14, marginRight: 14 }}>·</span>
                    <span style={{ color: netColor, fontSize: 44, fontWeight: 900 }}>
                      {top.net >= 0 ? "+" : ""}
                      {top.net}
                    </span>
                    <span style={{ color: "#888", fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>
                      NET
                    </span>
                    <span style={{ color: "#444", fontSize: 28, marginLeft: 14, marginRight: 14 }}>·</span>
                    <span style={{ color: "#ddd", fontSize: 26, fontWeight: 700 }}>Do you see it?</span>
                  </div>
                );
              })()}

              {/* Twin portraits */}
              <FaceCard
                x={OG_W / 2 - FACE_W - 80}
                y={FACE_Y}
                width={FACE_W}
                height={FACE_H}
                imgSrc={top.profilePath1 ? `${TMDB_PROFILE}${top.profilePath1}` : null}
                name={top.name1}
              />
              <FaceCard
                x={OG_W / 2 + 80}
                y={FACE_Y}
                width={FACE_W}
                height={FACE_H}
                imgSrc={top.profilePath2 ? `${TMDB_PROFILE}${top.profilePath2}` : null}
                name={top.name2}
              />

              {/* "=" in the middle */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: OG_W / 2 - 30,
                  top: FACE_Y + FACE_H / 2 - 38,
                  width: 60,
                  height: 76,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: RED,
                  borderRadius: 38,
                  boxShadow: "0 0 28px rgba(204,0,51,0.5)",
                }}
              >
                <span style={{ color: "white", fontSize: 38, fontWeight: 900, lineHeight: 1 }}>=</span>
              </div>
            </>
          ) : (
            <OgEmptyState
              line1="Spot the resemblance?"
              line2="Cast your first lookalike at theratist.com/community/looks-like"
            />
          )}
        </div>
      ),
      { width: OG_W, height: OG_H }
    );
  } catch (err) {
    console.error("OG looks-like error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function FaceCard({
  x,
  y,
  width,
  height,
  imgSrc,
  name,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  imgSrc: string | null;
  name: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: x,
        top: y,
        width,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          width,
          height,
          borderRadius: 18,
          border: `5px solid ${CREAM}`,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 14px 30px rgba(0,0,0,0.7)",
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            width={width}
            height={height}
            style={{ objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <span style={{ color: "white", fontSize: 80, fontWeight: 900 }}>
            {name[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </div>
      <span
        style={{
          color: "white",
          fontSize: 22,
          fontWeight: 900,
          marginTop: 14,
          maxWidth: width + 40,
          textAlign: "center",
          lineHeight: 1.1,
          textShadow: "0 2px 6px #000",
        }}
      >
        {name}
      </span>
    </div>
  );
}
