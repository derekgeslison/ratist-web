import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { OG_W, OG_H, OgHeader, OgEmptyState, CREAM } from "@/lib/og-community";

export const dynamic = "force-dynamic";

const GOLD = "#eab308"; // yellow-500
const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";

export async function GET() {
  try {
    const logoSrc = getLogoBase64();

    // Find the currently-active oscar year (the most recent, prioritising
    // one that isn't complete yet — i.e. an open prediction season).
    const year = await prisma.oscarYear.findFirst({
      orderBy: [{ isComplete: "asc" }, { year: "desc" }],
      include: {
        categories: {
          include: {
            votes: { select: { nomineeId: true } },
            nominees: { select: { id: true, movieTitle: true, posterPath: true, nomineeDetail: true } },
          },
        },
      },
    });

    if (!year || year.categories.length === 0) {
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
                background: "linear-gradient(135deg, #1f1804 0%, #0a0a0a 60%)",
              }}
            />
            <OgHeader logoSrc={logoSrc} eyebrow="OSCAR PICKS" url="theratist.com/community/oscar-picks" />
            <OgEmptyState
              line1="Predict the Oscars."
              line2="Cast your picks at theratist.com/community/oscar-picks"
            />
          </div>
        ),
        { width: OG_W, height: OG_H }
      );
    }

    // Rank categories by total vote count, pick top 3.
    // For each, find the most-voted nominee.
    const ranked = year.categories
      .map((cat) => {
        const totalVotes = cat.votes.length;
        const counts = new Map<string, number>();
        for (const v of cat.votes) counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
        let topNomineeId: string | null = null;
        let topVotes = 0;
        for (const [id, n] of counts) {
          if (n > topVotes) { topVotes = n; topNomineeId = id; }
        }
        const topNominee = cat.nominees.find((n) => n.id === topNomineeId) ?? null;
        return {
          id: cat.id,
          name: cat.name,
          totalVotes,
          topNominee,
          topVotes,
          leadShare: totalVotes > 0 ? Math.round((topVotes / totalVotes) * 100) : 0,
        };
      })
      .filter((c) => c.totalVotes > 0)
      .sort((a, b) => b.totalVotes - a.totalVotes)
      .slice(0, 3);

    const hasVotes = ranked.length > 0;

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
              background: "linear-gradient(135deg, #1f1804 0%, #0a0a0a 60%)",
            }}
          />

          <OgHeader logoSrc={logoSrc} eyebrow="OSCAR PICKS" url="theratist.com/community/oscar-picks" />

          {/* Title row */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "absolute",
              left: 60,
              top: 90,
              width: OG_W - 120,
            }}
          >
            <span
              style={{
                color: "white",
                fontSize: 48,
                fontWeight: 900,
                lineHeight: 1,
                textShadow: "0 2px 6px #000",
              }}
            >
              {year.year} Predictions
            </span>
            <span style={{ color: "#aaa", fontSize: 16, marginTop: 8 }}>
              {hasVotes ? "Top categories the community is voting on" : "Voting is open"}
            </span>
          </div>

          {/* 3 category cards */}
          {hasVotes && (
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                top: 230,
                width: OG_W,
                justifyContent: "center",
                gap: 24,
              }}
            >
              {ranked.map((c) => (
                <CategoryCard key={c.id} category={c} />
              ))}
            </div>
          )}

          {!hasVotes && (
            <OgEmptyState
              line1={`${year.year} Oscar Picks are open.`}
              line2="Be the first to cast your prediction."
            />
          )}
        </div>
      ),
      { width: OG_W, height: OG_H }
    );
  } catch (err) {
    console.error("OG oscar-picks error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function CategoryCard({
  category,
}: {
  category: {
    name: string;
    totalVotes: number;
    topNominee: { movieTitle: string; posterPath: string | null; nomineeDetail: string | null } | null;
    topVotes: number;
    leadShare: number;
  };
}) {
  const CARD_W = 340;
  const CARD_H = 340;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CARD_W,
        height: CARD_H,
        backgroundColor: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14,
        padding: 16,
        alignItems: "center",
      }}
    >
      {/* Category name */}
      <span
        style={{
          color: GOLD,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 1.5,
          textAlign: "center",
          textTransform: "uppercase",
          lineHeight: 1.15,
          maxWidth: CARD_W - 20,
        }}
      >
        {category.name}
      </span>

      {/* Poster */}
      <div
        style={{
          display: "flex",
          width: 130,
          height: 195,
          marginTop: 14,
          border: `4px solid ${CREAM}`,
          backgroundColor: "#1a1a1a",
          overflow: "hidden",
          boxShadow: "0 12px 24px rgba(0,0,0,0.7)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {category.topNominee?.posterPath ? (
          <img
            src={`${TMDB_POSTER}${category.topNominee.posterPath}`}
            width={130}
            height={195}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "#666", fontSize: 11, padding: 6, textAlign: "center" }}>
            {category.topNominee?.movieTitle ?? "—"}
          </span>
        )}
      </div>

      {/* Nominee title + actor (if any) */}
      <span
        style={{
          color: "white",
          fontSize: 15,
          fontWeight: 800,
          marginTop: 12,
          textAlign: "center",
          maxWidth: CARD_W - 20,
          lineHeight: 1.15,
        }}
      >
        {category.topNominee?.movieTitle ?? "—"}
      </span>
      {category.topNominee?.nomineeDetail && (
        <span
          style={{
            color: "#999",
            fontSize: 12,
            marginTop: 2,
            textAlign: "center",
            maxWidth: CARD_W - 20,
          }}
        >
          {category.topNominee.nomineeDetail}
        </span>
      )}

      {/* Vote stats */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: "auto" }}>
        <span style={{ color: GOLD, fontSize: 22, fontWeight: 900 }}>{category.leadShare}%</span>
        <span style={{ color: "#bbb", fontSize: 12 }}>
          of {category.totalVotes} {category.totalVotes === 1 ? "vote" : "votes"}
        </span>
      </div>
    </div>
  );
}
