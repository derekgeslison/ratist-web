import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/auth-helpers";
import { extractRecommendationFilters } from "@/lib/ai/recommend-filters";
import { checkAiRateLimit, logAiUsage } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to use AI recommendations" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 5) {
    return NextResponse.json({ error: "Please describe what you want to watch in a few words" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return NextResponse.json({ error: "Description is too long (max 500 characters)" }, { status: 400 });
  }

  const rateLimitError = await checkAiRateLimit(user, "recommend", { freeDaily: 20, paidDaily: 50 });
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  try {
    const filters = await extractRecommendationFilters(prompt);
    await logAiUsage(user.id, "recommend");
    return NextResponse.json({ filters });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("AI recommend — Anthropic auth failed:", err.message);
      return NextResponse.json({ error: "AI service isn't configured — please contact an admin." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`AI recommend — Anthropic API error ${err.status}:`, err.message);
      return NextResponse.json({ error: `AI error (${err.status}): ${err.message}` }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI recommend — unexpected error:", message, err);
    return NextResponse.json({ error: `AI extraction failed: ${message}` }, { status: 500 });
  }
}
