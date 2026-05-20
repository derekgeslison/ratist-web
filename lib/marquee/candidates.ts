import "server-only";
import { prisma } from "@/lib/prisma";
import type { MarqueeData } from "./aggregators";

/**
 * Marquee topic candidates + selection.
 *
 * Each generator emits a `TopicResult` describing both the topic's
 * HUD tile (what shows on the page) and its candidacy for the spoken
 * brief (whether it scored high enough to be narrated today). They're
 * intentionally separate concerns:
 *
 *   - A tile renders whenever there's something coherent to display
 *     (e.g., the "Moderation" tile always shows the queue depth, even
 *     if nothing's flagged for narration today).
 *
 *   - A candidate enters the brief selection only when its score
 *     clears whatever threshold the topic uses internally.
 *
 * "Permanent" topics (Users, Top feature, Moderation, etc.) always
 * have a tile. "Ephemeral" topics (Feature breakout, Threshold
 * crossing, Notable new user, etc.) only have a tile when their
 * trigger fires — there's nothing to show otherwise.
 *
 * Selection rule for the brief body: min 5, max 8, by score desc.
 */

// ── Public types ─────────────────────────────────────────────────────

export interface TopicCandidate {
  /** Stable identifier; the brief segment + tile share this key so the
   *  page can match them when highlighting. */
  section: string;
  /** 0-100. Ranking only — never shown to the user. */
  score: number;
  /** Topic-specific structured payload fed into the Claude prompt. */
  data: Record<string, unknown>;
  /** Human-readable hint surfaced to Claude as "why this matters". */
  reason: string;
}

export interface TopicTile {
  section: string;
  title: string;
  value: string | number;
  sub: string;
  trend: "up" | "down" | "flat" | null;
  /** Optional deep-link to the relevant admin sub-page. */
  href: string | null;
}

export interface TopicResult {
  tile: TopicTile | null;
  candidate: TopicCandidate | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDelta(d: { value: number; trend: "up" | "down" | "flat" } | null): string {
  if (!d) return "n/a";
  if (d.trend === "flat") return "flat WoW";
  return `${d.trend === "up" ? "+" : "−"}${Math.abs(d.value)}% WoW`;
}

// ── Permanent topics (tile always renders) ───────────────────────────

function userGrowth(data: MarqueeData): TopicResult {
  const u = data.users;
  const tile: TopicTile = {
    section: "users",
    title: "New users",
    value: u.newToday,
    sub: `${u.newThisWeek} this week · ${fmtDelta(u.weekDelta)}`,
    trend: u.weekDelta?.trend ?? null,
    href: "/admin/users",
  };
  if (u.newThisWeek === 0 && u.total === 0) return { tile, candidate: null };
  let score = 30;
  if (u.weekDelta?.trend === "up" && u.weekDelta.value >= 30) score += 30;
  else if (u.weekDelta?.trend === "down" && u.weekDelta.value >= 30) score += 25;
  if (u.newToday > 0) score += 10;
  if (u.newThisWeek === 0) score = 15;
  return {
    tile,
    candidate: {
      section: "users",
      score: Math.min(score, 100),
      data: { ...u },
      reason: u.weekDelta ? `${u.newThisWeek} new this week, ${u.weekDelta.trend} ${u.weekDelta.value}% WoW` : `${u.newThisWeek} new this week`,
    },
  };
}

function topFeature(data: MarqueeData): TopicResult {
  const top = data.features.topThisWeek[0];
  const tile: TopicTile = {
    section: "topFeature",
    title: "Top feature",
    value: top?.label ?? "—",
    sub: top ? `${top.thisWeek} events · ${fmtDelta(top.delta)}` : "no activity",
    trend: top?.delta?.trend ?? null,
    href: null,
  };
  if (!top || top.thisWeek === 0) return { tile, candidate: null };
  let score = 35 + Math.min(40, Math.floor(top.thisWeek / 5));
  if (top.delta?.trend === "up" && top.delta.value >= 50) score += 15;
  return {
    tile,
    candidate: {
      section: "topFeature",
      score: Math.min(score, 100),
      data: { ...top },
      reason: `${top.label} leading with ${top.thisWeek} events`,
    },
  };
}

function decliningFeature(data: MarqueeData): TopicResult {
  const dec = data.features.topDeclining[0];
  const tile: TopicTile = {
    section: "decliningFeature",
    title: "Watching",
    value: dec?.label ?? "—",
    sub: dec?.delta ? fmtDelta(dec.delta) : "nothing declining",
    trend: dec?.delta?.trend ?? null,
    href: null,
  };
  if (!dec || !dec.delta || dec.delta.trend !== "down") return { tile, candidate: null };
  let score = 35 + Math.min(40, dec.delta.value);
  if (dec.thisWeek + dec.lastWeek >= 20) score += 10;
  return {
    tile,
    candidate: {
      section: "decliningFeature",
      score: Math.min(score, 100),
      data: { ...dec },
      reason: `${dec.label} dropped ${dec.delta.value}% WoW`,
    },
  };
}

function feedback(data: MarqueeData): TopicResult {
  const f = data.feedback;
  const tile: TopicTile = {
    section: "feedback",
    title: "Feedback",
    value: f.newToday,
    sub: `${f.newThisWeek} this week`,
    trend: null,
    href: "/admin/feedback",
  };
  if (f.newThisWeek === 0) return { tile, candidate: null };
  const bugCount = (f.byCategory.bug ?? 0) + (f.byCategory.inaccurate_info ?? 0);
  let score = 30 + f.newThisWeek * 5 + bugCount * 8;
  if (f.newToday > 0) score += 10;
  return {
    tile,
    candidate: {
      section: "feedback",
      score: Math.min(score, 100),
      data: { ...f },
      reason: `${f.newThisWeek} new feedback items, ${bugCount} bug/accuracy-flavored`,
    },
  };
}

function moderation(data: MarqueeData): TopicResult {
  const m = data.moderation;
  const tile: TopicTile = {
    section: "moderation",
    title: "Moderation",
    value: m.pendingCount,
    sub: m.oldestPendingAgeDays != null ? `oldest ${m.oldestPendingAgeDays}d` : "queue clear",
    trend: m.pendingCount > 0 ? "down" : null,
    href: "/admin/moderation",
  };
  if (m.pendingCount === 0 && m.newThisWeek === 0) return { tile, candidate: null };
  let score = 25 + Math.min(40, m.pendingCount * 8);
  if (m.newThisWeek > 0) score += 10;
  return {
    tile,
    candidate: {
      section: "moderation",
      score: Math.min(score, 100),
      data: { ...m },
      reason: `${m.pendingCount} pending, ${m.newThisWeek} new this week`,
    },
  };
}

function community(data: MarqueeData): TopicResult {
  const c = data.community;
  const tile: TopicTile = {
    section: "community",
    title: "Hot thread",
    value: c.hotThreads[0]?.viewCount ?? 0,
    sub: c.hotThreads[0]?.title?.slice(0, 32) ?? "no threads this week",
    trend: null,
    href: null,
  };
  const totalSignal =
    c.hotThreads.reduce((s, t) => s + t.viewCount + t.replyCount * 5, 0)
    + c.topWatchlistedMovies.reduce((s, m) => s + m.addCount, 0)
    + c.mostRatedMovies.reduce((s, m) => s + m.newRatings * 2, 0);
  if (totalSignal === 0) return { tile, candidate: null };
  return {
    tile,
    candidate: {
      section: "community",
      score: 35 + Math.min(40, Math.floor(totalSignal / 5)),
      data: { ...c },
      reason: c.hotThreads[0] ? `Hot thread "${c.hotThreads[0].title}" (${c.hotThreads[0].viewCount} views)` : `Community activity rolling`,
    },
  };
}

function subscriptions(data: MarqueeData): TopicResult {
  const s = data.subscriptions;
  const tile: TopicTile = {
    section: "subscriptions",
    title: "BSP active",
    value: s.activePassCount,
    sub: `+${s.newPassesThisWeek} / −${s.canceledThisWeek} this week`,
    trend: s.newPassesThisWeek > s.canceledThisWeek ? "up" : s.canceledThisWeek > s.newPassesThisWeek ? "down" : "flat",
    href: "/admin/subscriptions",
  };
  if (s.activePassCount === 0 && s.newPassesThisWeek === 0 && s.canceledThisWeek === 0) return { tile, candidate: null };
  let score = 30 + s.newPassesThisWeek * 12 + s.canceledThisWeek * 8;
  if (s.newPassesThisWeek > s.canceledThisWeek) score += 5;
  return {
    tile,
    candidate: {
      section: "subscriptions",
      score: Math.min(score, 100),
      data: { ...s },
      reason: `${s.activePassCount} active, +${s.newPassesThisWeek} / −${s.canceledThisWeek} this week`,
    },
  };
}

function aiCost(data: MarqueeData): TopicResult {
  const a = data.aiCost;
  const tile: TopicTile = {
    section: "aiCost",
    title: "AI calls",
    value: a.callsToday,
    sub: `${a.callsThisWeek} this week · ${fmtDelta(a.weekDelta)}`,
    trend: a.weekDelta?.trend ?? null,
    href: "/admin/ai-usage",
  };
  if (a.callsThisWeek === 0) return { tile, candidate: null };
  let score = 30 + Math.min(30, Math.floor(a.callsThisWeek / 10));
  if (a.weekDelta?.trend === "up" && a.weekDelta.value >= 50) score += 15;
  return {
    tile,
    candidate: {
      section: "aiCost",
      score: Math.min(score, 100),
      data: { ...a },
      reason: `${a.callsThisWeek} AI calls this week, ${a.weekDelta?.trend ?? "flat"} ${a.weekDelta?.value ?? 0}% WoW`,
    },
  };
}

// ── Ephemeral topics (tile only renders when triggered) ──────────────

function featureBreakout(data: MarqueeData): TopicResult {
  const topLabel = data.features.topThisWeek[0]?.label;
  const candidates = data.features.all.filter(
    (f) => f.label !== topLabel && f.delta?.trend === "up" && f.delta.value >= 100 && f.thisWeek >= 5,
  );
  if (candidates.length === 0) return { tile: null, candidate: null };
  candidates.sort((a, b) => (b.delta?.value ?? 0) - (a.delta?.value ?? 0));
  const winner = candidates[0];
  return {
    tile: {
      section: "featureBreakout",
      title: "Breakout",
      value: winner.label,
      sub: `${winner.thisWeek} events · ${fmtDelta(winner.delta)}`,
      trend: "up",
      href: null,
    },
    candidate: {
      section: "featureBreakout",
      score: 75 + Math.min(20, Math.floor((winner.delta?.value ?? 100) / 50)),
      data: { ...winner },
      reason: `${winner.label} breakout: ${winner.delta?.value}% WoW jump`,
    },
  };
}

function featureCollapse(data: MarqueeData): TopicResult {
  const decliningLabel = data.features.topDeclining[0]?.label;
  const candidates = data.features.all.filter(
    (f) => f.label !== decliningLabel && f.delta?.trend === "down" && f.delta.value >= 50 && f.lastWeek >= 10,
  );
  if (candidates.length === 0) return { tile: null, candidate: null };
  candidates.sort((a, b) => (b.delta?.value ?? 0) - (a.delta?.value ?? 0));
  const winner = candidates[0];
  return {
    tile: {
      section: "featureCollapse",
      title: "Collapse",
      value: winner.label,
      sub: `${winner.lastWeek} → ${winner.thisWeek} (${fmtDelta(winner.delta)})`,
      trend: "down",
      href: null,
    },
    candidate: {
      section: "featureCollapse",
      score: 70 + Math.min(20, Math.floor((winner.delta?.value ?? 50) / 5)),
      data: { ...winner },
      reason: `${winner.label} collapse: dropped ${winner.delta?.value}% WoW from ${winner.lastWeek} → ${winner.thisWeek}`,
    },
  };
}

function moderationBacklog(data: MarqueeData): TopicResult {
  const m = data.moderation;
  if (m.oldestPendingAgeDays == null || m.oldestPendingAgeDays < 3) return { tile: null, candidate: null };
  return {
    tile: {
      section: "moderationBacklog",
      title: "Mod backlog",
      value: `${m.oldestPendingAgeDays}d`,
      sub: `${m.pendingCount} pending, oldest aging`,
      trend: "down",
      href: "/admin/moderation",
    },
    candidate: {
      section: "moderationBacklog",
      score: 60 + Math.min(35, m.oldestPendingAgeDays * 4),
      data: { oldestAgeDays: m.oldestPendingAgeDays, pendingCount: m.pendingCount },
      reason: `Oldest pending report is ${m.oldestPendingAgeDays} days old`,
    },
  };
}

function titleBreakout(data: MarqueeData): TopicResult {
  const movie = data.community.mostRatedMovies[0];
  const watchlisted = data.community.topWatchlistedMovies[0];
  const show = data.community.mostRatedShows[0];
  type Pick = { kind: "movie_rated" | "show_rated" | "movie_watchlisted"; title: string; count: number };
  const picks: Pick[] = [];
  if (movie && movie.newRatings >= 3) picks.push({ kind: "movie_rated", title: movie.title, count: movie.newRatings });
  if (show && show.newRatings >= 3) picks.push({ kind: "show_rated", title: show.title, count: show.newRatings });
  if (watchlisted && watchlisted.addCount >= 5) picks.push({ kind: "movie_watchlisted", title: watchlisted.title, count: watchlisted.addCount });
  if (picks.length === 0) return { tile: null, candidate: null };
  picks.sort((a, b) => b.count - a.count);
  const top = picks[0];
  const subVerb = top.kind === "movie_watchlisted" ? "watchlist adds" : "new ratings";
  return {
    tile: {
      section: "titleBreakout",
      title: "Title breakout",
      value: top.title.length > 24 ? top.title.slice(0, 22) + "…" : top.title,
      sub: `${top.count} ${subVerb}`,
      trend: "up",
      href: null,
    },
    candidate: {
      section: "titleBreakout",
      score: 60 + Math.min(30, top.count * 3),
      data: { ...top },
      reason: `"${top.title}" breakout: ${top.count} ${subVerb}`,
    },
  };
}

function firstPaidBsp(data: MarqueeData): TopicResult {
  if (!(data.subscriptions.newPassesThisWeek === 1 && data.subscriptions.activePassCount === 1)) {
    return { tile: null, candidate: null };
  }
  return {
    tile: {
      section: "firstPaidBsp",
      title: "First paid BSP",
      value: "🎉",
      sub: "Milestone reached",
      trend: "up",
      href: "/admin/subscriptions",
    },
    candidate: {
      section: "firstPaidBsp",
      score: 95,
      data: { ...data.subscriptions },
      reason: `First paying Backstage Pass subscriber this week`,
    },
  };
}

const USER_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function thresholdCrossing(data: MarqueeData): TopicResult {
  const total = data.users.total;
  const lastWeekTotal = total - data.users.newThisWeek;
  const crossed = USER_THRESHOLDS.find((t) => lastWeekTotal < t && total >= t);
  if (!crossed) return { tile: null, candidate: null };
  return {
    tile: {
      section: "thresholdCrossing",
      title: "Milestone",
      value: crossed,
      sub: `Users crossed ${crossed}`,
      trend: "up",
      href: "/admin/users",
    },
    candidate: {
      section: "thresholdCrossing",
      score: 90,
      data: { threshold: crossed, total },
      reason: `Total users crossed ${crossed} this week (${lastWeekTotal} → ${total})`,
    },
  };
}

function aiCostSpike(data: MarqueeData): TopicResult {
  const a = data.aiCost;
  if (a.callsToday < 5) return { tile: null, candidate: null };
  const weeklyDailyAvg = a.callsThisWeek / 7;
  if (weeklyDailyAvg === 0) return { tile: null, candidate: null };
  const ratio = a.callsToday / weeklyDailyAvg;
  if (ratio < 2) return { tile: null, candidate: null };
  return {
    tile: {
      section: "aiCostSpike",
      title: "AI spike",
      value: `${ratio.toFixed(1)}×`,
      sub: `${a.callsToday} today vs ${weeklyDailyAvg.toFixed(1)} avg`,
      trend: "up",
      href: "/admin/ai-usage",
    },
    candidate: {
      section: "aiCostSpike",
      score: 70 + Math.min(25, Math.floor(ratio * 5)),
      data: { callsToday: a.callsToday, weeklyDailyAvg: Math.round(weeklyDailyAvg * 10) / 10, ratio: Math.round(ratio * 10) / 10 },
      reason: `Today's AI calls (${a.callsToday}) are ${ratio.toFixed(1)}× the weekly daily average`,
    },
  };
}

async function notableNewUser(): Promise<TopicResult> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  const adminIds = admins.map((a) => a.id);
  try {
    const recent = await prisma.user.findMany({
      where: {
        createdAt: { gte: weekAgo },
        deletedAt: null,
        isAdmin: false,
        ...(adminIds.length > 0 ? { id: { notIn: adminIds } } : {}),
      },
      select: { id: true, name: true, createdAt: true, _count: { select: { ratings: true, tvShowRatings: true } } },
    });
    const annotated = recent
      .map((u) => ({ ...u, totalRatings: u._count.ratings + u._count.tvShowRatings }))
      .filter((u) => u.totalRatings >= 20)
      .sort((a, b) => b.totalRatings - a.totalRatings);
    if (annotated.length === 0) return { tile: null, candidate: null };
    const top = annotated[0];
    const days = Math.floor((Date.now() - top.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    return {
      tile: {
        section: "notableNewUser",
        title: "Notable signup",
        value: top.totalRatings,
        sub: `${top.name} · ${days}d ago`,
        trend: "up",
        href: "/admin/users",
      },
      candidate: {
        section: "notableNewUser",
        score: 75 + Math.min(20, Math.floor(top.totalRatings / 10)),
        data: { name: top.name, totalRatings: top.totalRatings, joinedDaysAgo: days },
        reason: `${top.name} joined ${days}d ago and already has ${top.totalRatings} ratings`,
      },
    };
  } catch {
    return { tile: null, candidate: null };
  }
}

// ── Selection ────────────────────────────────────────────────────────

const MIN_SECTIONS = 5;
const MAX_SECTIONS = 8;

export interface SelectionResult {
  selected: TopicCandidate[];   // top 5-8 by score for the brief
  tiles: TopicTile[];           // every renderable tile (incl. unselected permanents)
}

export async function selectTopicCandidates(data: MarqueeData): Promise<SelectionResult> {
  const syncResults: TopicResult[] = [
    userGrowth(data),
    topFeature(data),
    decliningFeature(data),
    feedback(data),
    moderation(data),
    community(data),
    subscriptions(data),
    aiCost(data),
    featureBreakout(data),
    featureCollapse(data),
    moderationBacklog(data),
    titleBreakout(data),
    firstPaidBsp(data),
    thresholdCrossing(data),
    aiCostSpike(data),
  ];
  const asyncResults = await Promise.all([notableNewUser()]);
  const allResults = [...syncResults, ...asyncResults];

  const candidates = allResults.map((r) => r.candidate).filter((c): c is TopicCandidate => c != null);
  candidates.sort((a, b) => b.score - a.score);
  let selected = candidates.slice(0, MAX_SECTIONS);
  if (selected.length < MIN_SECTIONS && candidates.length > selected.length) {
    selected = candidates.slice(0, Math.min(candidates.length, MIN_SECTIONS));
  }

  const tiles = allResults.map((r) => r.tile).filter((t): t is TopicTile => t != null);

  return { selected, tiles };
}
