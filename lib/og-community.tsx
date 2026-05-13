// Shared OG-card helpers for the five community-submission share cards
// (hot-takes / pitches / looks-like / recast / oscar-picks). Each card lives
// in its own /api/og/{slug}/route.tsx so the layout can be tuned per feature;
// the bits below are the consistent header + brand strip and a generic
// empty-state for when no submissions exist yet.
//
// next/og JSX, so every container needs display: flex / explicit dims.

export const OG_W = 1200;
export const OG_H = 630;
export const RED = "#CC0033";
export const CREAM = "#f5f1e8";

export function OgHeader({
  logoSrc,
  eyebrow,
  url,
}: {
  logoSrc: string;
  eyebrow: string;
  url: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "22px 36px 0 36px",
        width: OG_W,
      }}
    >
      <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
      <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1.5 }}>THE RATIST</span>
      <span style={{ color: "#555", fontSize: 13, marginLeft: 4 }}>·</span>
      <span style={{ color: "#888", fontSize: 13, letterSpacing: 2.5, textTransform: "uppercase" }}>{eyebrow}</span>
      <div style={{ display: "flex", flex: 1 }} />
      <span style={{ color: "#888", fontSize: 14, letterSpacing: 0.8, fontWeight: 600 }}>{url}</span>
    </div>
  );
}

export function OgEmptyState({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: 0,
        top: 220,
        width: OG_W,
        alignItems: "center",
      }}
    >
      <span style={{ color: "white", fontSize: 40, fontWeight: 900, textAlign: "center", maxWidth: 900 }}>
        {line1}
      </span>
      <span style={{ color: "#888", fontSize: 18, marginTop: 18, textAlign: "center" }}>{line2}</span>
    </div>
  );
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// Combined total + net vote stat block, used by all four submission-style
// cards. `total` is the count of votes; `net` is the sum of values
// (upvotes − downvotes). Net is colored green/red based on sign so the
// audience can read "this is widely loved" vs "the take is divisive."
export function VoteStats({
  total,
  net,
  accent,
  align = "flex-end",
}: {
  total: number;
  net: number;
  accent: string;
  align?: "flex-start" | "flex-end" | "center";
}) {
  const netColor = net > 0 ? "#22c55e" : net < 0 ? "#ef4444" : "#888";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align }}>
      <span style={{ color: accent, fontSize: 84, fontWeight: 900, lineHeight: 1 }}>{total}</span>
      <span
        style={{
          color: "#aaa",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 2.5,
          marginTop: 8,
        }}
      >
        {total === 1 ? "VOTE" : "VOTES"}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginTop: 14,
          gap: 8,
        }}
      >
        <span style={{ color: netColor, fontSize: 36, fontWeight: 900 }}>
          {net >= 0 ? "+" : ""}
          {net}
        </span>
        <span style={{ color: "#888", fontSize: 14, fontWeight: 800, letterSpacing: 2 }}>NET</span>
      </div>
    </div>
  );
}
