import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { checkCommunityRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["PUNCH_AND_JUDY", "MOVIE_MAP"] as const;
type ValidType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is ValidType {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to submit an idea" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !isValidType(body.type)) {
    return NextResponse.json({ error: "Invalid idea type" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < 10) {
    return NextResponse.json({ error: "Description must be at least 10 characters" }, { status: 400 });
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: "Description is too long (max 2,000 characters)" }, { status: 400 });
  }

  const media = body.media && typeof body.media === "object" ? body.media : null;
  const person = body.person && typeof body.person === "object" ? body.person : null;

  const rateLimitError = await checkCommunityRateLimit(user.id, user.isAdmin, "postIdea");
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  const idea = await prisma.postIdea.create({
    data: {
      type: body.type,
      submitterId: user.id,
      description,
      mediaTmdbId: media?.tmdbId ?? null,
      mediaType: media?.mediaType === "movie" || media?.mediaType === "tv" ? media.mediaType : null,
      mediaTitle: media?.title ?? null,
      mediaPosterPath: media?.posterPath ?? null,
      personTmdbId: person?.tmdbId ?? null,
      personName: person?.name ?? null,
      personProfilePath: person?.profilePath ?? null,
    },
  });

  return NextResponse.json({ idea: { id: idea.id } });
}
