import { getAnthropic } from "./client";

// Cap tokens we send — keep cost predictable even on titles with many reviews
const MAX_REVIEWS_TO_SEND = 20;
const MAX_REVIEW_CHARS = 1500;

interface ReviewSample {
  rating: number | null; // 0-10 Ratist rating
  text: string;
}

const SYSTEM_PROMPT = `You summarize community movie/TV reviews in 2-3 neutral sentences.

Rules:
- Focus on what reviewers consistently praise and consistently criticize across the sample — look for themes, not outliers.
- Write in neutral, third-person tone: "Reviewers tend to...", "Many fans feel...", "Common complaints include...".
- Do NOT name specific reviewers or quote them directly.
- Do NOT invent facts, plot details, or claims not supported by the reviews.
- Do NOT use markdown, bullet points, headers, or lists — plain prose only.
- If the sample is too small or mixed to summarize meaningfully, say so briefly instead of padding.
- Output only the summary text. No preamble, no sign-off.`;

export async function generateReviewDigest(
  title: string,
  reviews: ReviewSample[],
): Promise<string> {
  if (reviews.length === 0) {
    throw new Error("No reviews to summarize");
  }
  const trimmed = reviews.slice(0, MAX_REVIEWS_TO_SEND).map((r) => ({
    rating: r.rating,
    text: r.text.slice(0, MAX_REVIEW_CHARS),
  }));
  const userMessage = `Title: ${title}\n\nCommunity reviews (rating out of 10 when given):\n\n${trimmed
    .map((r, i) => `[${i + 1}] ${r.rating != null ? `${r.rating}/10 — ` : ""}${r.text}`)
    .join("\n\n")}`;

  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI returned no text");
  }
  return textBlock.text.trim();
}

/**
 * Whether a cached digest should be regenerated. Returns true if the review
 * count has grown by at least 3 reviews AND at least 20% since the last gen,
 * so active titles don't trigger a regen on every new review.
 */
export function isDigestStale(cachedCount: number, currentCount: number): boolean {
  if (currentCount <= cachedCount) return false;
  const diff = currentCount - cachedCount;
  return diff >= 3 && currentCount >= cachedCount * 1.2;
}
