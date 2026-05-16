import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { extractRecommendationFilters } from "@/lib/ai/recommend-filters";
import { checkAndLogAiToolsRateLimit, RateLimitError } from "@/lib/ai/rate-limit";
import { sanitizeAiError } from "@/lib/ai/sanitize-error";

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

  // Atomic check + log at start of route — prevents cancel-and-retry
  // amplification (user closes tab mid-Anthropic, never gets logged,
  // re-submits) and the parallel-requests-both-pass-cap race.
  try {
    await checkAndLogAiToolsRateLimit(user, "recommend");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.userMessage }, { status: 429 });
    }
    throw err;
  }

  try {
    const filters = await extractRecommendationFilters(prompt);
    return NextResponse.json({ filters });
  } catch (err) {
    const { status, body: errBody } = sanitizeAiError(err, "recommend");
    return NextResponse.json(errBody, { status });
  }
}
