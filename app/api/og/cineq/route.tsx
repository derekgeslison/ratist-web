import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attemptId") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const attempt = await prisma.cineQAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: { select: { name: true, avatarUrl: true } },
        daily: { select: { date: true } },
      },
    });
    if (!attempt) return new Response("Not found", { status: 404 });

    const diffMultiplier = attempt.difficulty === "hard" ? 2.0 : attempt.difficulty === "medium" ? 1.5 : 1.0;
    const weightedScore = Math.round(attempt.rawScore * diffMultiplier * 10) / 10;
    const answers = attempt.answers as unknown as { correct: boolean; points: number; wrongGuesses: number }[];
    const correctCount = answers.filter((a) => a.correct).length;
    const diffLabel = attempt.difficulty.charAt(0).toUpperCase() + attempt.difficulty.slice(1);
    const typeLabel = attempt.mediaType === "both" ? "Movies & TV" : attempt.mediaType === "tv" ? "TV Shows" : "Movies";
    const modeLabel = attempt.mode === "daily" ? "Daily Challenge" : "Practice";
    const dateLabel = attempt.daily?.date ?? "";

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 28 }}>🧠</span>
              <span style={{ color: "#ec4899", fontWeight: 800, fontSize: 22 }}>Cine-Q</span>
            </div>
          </div>

          {/* User + Score */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
            {attempt.user.avatarUrl && (
              <img src={attempt.user.avatarUrl} width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 22 }}>{attempt.user.name}</span>
              <span style={{ color: "#888", fontSize: 14 }}>{modeLabel} · {typeLabel} · {diffLabel}{dateLabel ? ` · ${dateLabel}` : ""}</span>
            </div>
          </div>

          {/* Big score */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 28 }}>
            <span style={{ color: scoreHex(attempt.rawScore / 100), fontWeight: 900, fontSize: 72 }}>
              {attempt.rawScore.toFixed(1)}
            </span>
            <span style={{ color: "#666", fontSize: 28, fontWeight: 600 }}>/ 1000</span>
            {diffMultiplier > 1 && (
              <span style={{ color: "#10b981", fontSize: 18, fontWeight: 700, marginLeft: 12 }}>
                {diffMultiplier}x → {weightedScore.toFixed(1)}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 24 }}>{correctCount}/10</span>
              <span style={{ color: "#888", fontSize: 13 }}>Correct</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 24 }}>
                {answers.reduce((s, a) => s + (a.wrongGuesses ?? 0), 0)}
              </span>
              <span style={{ color: "#888", fontSize: 13 }}>Wrong Guesses</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 24 }}>{diffLabel}</span>
              <span style={{ color: "#888", fontSize: 13 }}>Difficulty</span>
            </div>
          </div>
        </div>
      ),
      { width: 800, height: 420 }
    );
  } catch (err) {
    console.error("CineQ OG error:", err);
    return new Response("Error", { status: 500 });
  }
}
