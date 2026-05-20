import "server-only";
import { getAnthropic } from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";
import {
  getUserMetrics, getFeatureMetrics, getFeedbackSummary, getModerationMetrics,
  getCommunityHighlights, getSubscriptionMetrics, getAiCostMetrics,
} from "./aggregators";

/**
 * Marquee Q&A — ask Marquee anything about the admin state.
 *
 * Uses Claude tool-use: we register a small library of read-only data
 * tools, Claude decides which to call based on the question, we execute
 * them and feed results back. Final answer comes out as natural language
 * the TTS layer can speak.
 *
 * Tools are intentionally narrow — each one does one job and returns a
 * compact JSON shape. Letting Claude compose them across multi-turn calls
 * is more flexible than a single mega-tool with branching.
 *
 * Hard cap on tool-use rounds to prevent runaway loops. In practice
 * questions resolve in 1-2 rounds.
 */

const MAX_TOOL_ROUNDS = 5;

// ── Tool registry ────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_user_metrics",
    description: "Get new-user counts: today, this week, last week, total. Use for questions about signup growth or active user counts.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_feature_metrics",
    description: "Get usage events this week vs last week for EVERY tracked feature — movie ratings, show ratings, screening rooms, forum threads, watch companions, collections, AI tool calls, comments, follows, hot takes, recasts, looks like, watchlist additions, seen marks. Returns the full list (in `all`) plus curated `topThisWeek` and `topDeclining`. Use this whenever asked about ANY specific feature's usage — the answer will be in `all`. Admin activity is excluded.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_feedback_summary",
    description: "Get the count of feedback submissions today and this week, broken down by category (bug, feature_request, etc.), with the 10 most recent messages truncated. Use for any question about user feedback themes.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_moderation_metrics",
    description: "Get pending report count, new reports this week, and age of the oldest pending report. Use for questions about moderation queue or content violations.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_community_highlights",
    description: "Get the 3 hottest forum threads this week by views, and the 3 highest-rated reviews this week. Use for questions about what the community is engaged with.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_subscription_metrics",
    description: "Get active Backstage Pass count, new subscriptions this week, and cancellations this week. Use for questions about revenue or BSP.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_ai_cost_metrics",
    description: "Get AI tool call counts (today, this week, last week) and the top 3 features by call volume. Use for questions about AI usage or cost.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_top_rated_movies",
    description: "Get the highest-rated movies in a time window, by community average ratistRating. Useful for 'what are people loving' style questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        windowDays: { type: "number", description: "Lookback window in days (e.g. 7, 30, 365)" },
        limit: { type: "number", description: "How many to return (max 20)" },
      },
      required: ["windowDays"],
    },
  },
  {
    name: "search_users",
    description: "Find users by partial name or email match (case-insensitive). Returns up to 10 results with key facts. Use for 'how is user X doing?' or 'who is X?' questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Partial name or email to match" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_recent_signups",
    description: "Get the most recent users to sign up, ordered newest first. Use for 'who joined recently' questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "How many to return (max 25)" },
      },
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_user_metrics": return getUserMetrics();
    case "get_feature_metrics": return getFeatureMetrics();
    case "get_feedback_summary": return getFeedbackSummary();
    case "get_moderation_metrics": return getModerationMetrics();
    case "get_community_highlights": return getCommunityHighlights();
    case "get_subscription_metrics": return getSubscriptionMetrics();
    case "get_ai_cost_metrics": return getAiCostMetrics();
    case "get_top_rated_movies": {
      const windowDays = Math.max(1, Number(input.windowDays ?? 30));
      const limit = Math.min(20, Math.max(1, Number(input.limit ?? 10)));
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const rows = await prisma.movieRating.groupBy({
        by: ["movieId"],
        where: { createdAt: { gte: since }, excluded: false, ratistRating: { not: null } },
        _avg: { ratistRating: true },
        _count: { ratistRating: true },
        having: { ratistRating: { _count: { gte: 2 } } },
        orderBy: { _avg: { ratistRating: "desc" } },
        take: limit,
      });
      const movies = await prisma.movie.findMany({
        where: { id: { in: rows.map((r) => r.movieId) } },
        select: { id: true, title: true, tmdbId: true },
      });
      const titleById = new Map(movies.map((m) => [m.id, m]));
      return rows.map((r) => ({
        title: titleById.get(r.movieId)?.title ?? "(unknown)",
        tmdbId: titleById.get(r.movieId)?.tmdbId,
        avgRatistRating: r._avg.ratistRating != null ? Math.round(r._avg.ratistRating * 10) / 10 : null,
        ratingCount: r._count.ratistRating,
      }));
    }
    case "search_users": {
      const query = String(input.query ?? "").trim();
      if (!query) return { results: [] };
      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, name: true, email: true, createdAt: true, isAdmin: true,
          subscriptionTier: true, subscriptionStatus: true,
          _count: { select: { ratings: true, tvShowRatings: true } },
        },
        take: 10,
      });
      return {
        results: users.map((u) => ({
          name: u.name, email: u.email, joinedAt: u.createdAt.toISOString().slice(0, 10),
          admin: u.isAdmin,
          backstagePass: u.subscriptionTier === "backstage_pass" && (u.subscriptionStatus === "active" || u.subscriptionStatus === "admin_granted"),
          totalRatings: u._count.ratings + u._count.tvShowRatings,
        })),
      };
    }
    case "get_recent_signups": {
      const limit = Math.min(25, Math.max(1, Number(input.limit ?? 10)));
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { name: true, email: true, createdAt: true, _count: { select: { ratings: true } } },
      });
      return users.map((u) => ({
        name: u.name,
        email: u.email,
        joinedAt: u.createdAt.toISOString(),
        movieRatings: u._count.ratings,
      }));
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

const SYSTEM_PROMPT = `You are Marquee — the in-house briefing voice for The Ratist (a movie & TV rating platform). The owner (Derek) is asking you a question about the platform's current state. You have access to a set of read-only data tools to look things up. Admin activity is already filtered out of every aggregator — the numbers you see represent real users only.

How to answer:
- Call whatever tools you need (you can call multiple in parallel).
- Answer in British English, formal-but-warm. Think Jarvis from Iron Man — calm, dry, never sycophantic.
- BE BRIEF. This will be spoken aloud. Default to 1-2 sentences. Maximum 3 sentences unless the question genuinely requires more context. No preamble, no caveats, no "here's what I found" — just the answer.
- Use specific numbers. "Twelve" not "a handful".
- If the data only partially answers the question, give what you have in one sentence and note what's missing in another. Don't explain at length.
- If the question can't be answered with available tools, say so in one sentence.

Never invent numbers. Only report what the tools returned.`;

export interface AskResult {
  /** Final natural-language answer Marquee speaks. */
  answer: string;
  /** Which tools were called (for transparency/debugging). */
  toolCalls: { name: string; input: Record<string, unknown> }[];
}

export async function askMarquee(question: string): Promise<AskResult> {
  const client = getAnthropic();
  const messages: Array<
    | { role: "user"; content: string | Array<{ type: "tool_result"; tool_use_id: string; content: string }> }
    | { role: "assistant"; content: unknown[] }
  > = [{ role: "user", content: question }];

  const toolCalls: { name: string; input: Record<string, unknown> }[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: messages as never,
    });

    // Stash this assistant turn so the next iteration can reference it.
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim();
      return { answer: text || "I'm sorry — I don't have an answer for that.", toolCalls };
    }

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter((b) => b.type === "tool_use") as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>;
      const results: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const tu of toolUses) {
        toolCalls.push({ name: tu.name, input: tu.input });
        const result = await executeTool(tu.name, tu.input);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // Unknown stop reason — break the loop and return whatever text exists.
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return { answer: text || "I'm sorry — something interrupted my reasoning.", toolCalls };
  }

  return { answer: "I ran out of reasoning steps trying to answer that. Try narrowing the question.", toolCalls };
}
