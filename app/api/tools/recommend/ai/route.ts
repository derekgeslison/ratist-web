import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { extractRecommendationFilters } from "@/lib/ai/recommend-filters";
import { checkAiToolsRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
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

  const rateLimitError = await checkAiToolsRateLimit(user);
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  try {
    const filters = await extractRecommendationFilters(prompt);
    await logAiUsage(user.id, "recommend");
    return NextResponse.json({ filters });
  } catch (err) {
    const { status, body: errBody } = sanitizeAiError(err, "recommend");
    return NextResponse.json(errBody, { status });
  }
}
