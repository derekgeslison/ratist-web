import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { draftMovieMap, type MovieMapInput } from "@/lib/ai/movie-map-draft";
import { renderMovieMapSvg } from "@/lib/ai/movie-map-render";
import { checkAiRateLimit, logAiUsage, FEATURE_CAPS } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { prompt?: unknown; movies?: unknown } | null;

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length > 800) {
    return NextResponse.json({ error: "Guidance is too long (max 800 characters)" }, { status: 400 });
  }

  const rawMovies = Array.isArray(body?.movies) ? body!.movies : [];
  const movies: MovieMapInput["movies"] = rawMovies
    .filter((m: unknown): m is { title?: unknown; mediaType?: unknown; year?: unknown } => typeof m === "object" && m !== null)
    .map((m) => ({
      title: typeof m.title === "string" ? m.title.slice(0, 200) : "",
      mediaType: m.mediaType === "tv" ? "tv" : "movie",
      year: typeof m.year === "number" && m.year > 1800 && m.year < 2100 ? m.year : null,
    }))
    .filter((m): m is { title: string; mediaType: "movie" | "tv"; year: number | null } => m.title.length > 0)
    .slice(0, 6);

  if (!prompt && movies.length === 0) {
    return NextResponse.json({ error: "Provide a movie or a prompt" }, { status: 400 });
  }

  const rateLimitError = await checkAiRateLimit(user, "movie_map_draft", FEATURE_CAPS.movie_map_draft);
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  try {
    const draft = await draftMovieMap({ prompt, movies });
    const svg = renderMovieMapSvg(draft);
    await logAiUsage(user.id, "movie_map_draft");
    return NextResponse.json({ draft, svg });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("AI movie-map — Anthropic auth failed:", err.message);
      return NextResponse.json({ error: "AI service isn't configured — check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`AI movie-map — Anthropic API error ${err.status}:`, err.message);
      return NextResponse.json({ error: `AI error (${err.status}): ${err.message}` }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI movie-map — unexpected error:", message, err);
    return NextResponse.json({ error: `Draft failed: ${message}` }, { status: 500 });
  }
}
