import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;

// GET /api/profile/match?targetUserId=...
// Returns the taste match percentage between the authenticated user and the target user.
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ match: null });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("targetUserId");
    if (!targetUserId) return NextResponse.json({ match: null });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const viewer = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!viewer) return NextResponse.json({ match: null });

    // Don't compute match with yourself
    if (viewer.id === targetUserId) return NextResponse.json({ match: null });

    const [myProfile, theirProfile] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: viewer.id } }),
      prisma.userProfile.findUnique({ where: { userId: targetUserId } }),
    ]);

    if (!myProfile || !theirProfile) return NextResponse.json({ match: null });

    const allKeys = [...COMPONENT_KEYS, ...GENRE_KEYS] as const;
    const similarities = allKeys.map((key) =>
      dimensionSimilarity(myProfile[key], theirProfile[key])
    );
    const overall = Math.round(
      (similarities.reduce((a, b) => a + b, 0) / similarities.length) * 100
    );

    return NextResponse.json({ match: overall });
  } catch {
    return NextResponse.json({ match: null });
  }
}
