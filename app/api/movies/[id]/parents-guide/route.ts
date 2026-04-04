import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DDD_API_KEY = process.env.DDD_API_KEY;
const DDD_BASE = "https://www.doesthedogdie.com";

// Topic weights: heavy (3), medium (2), light (1)
// A topic is "confirmed" when yes > 70% of votes AND at least 3 total votes
interface TopicDef { id: number; label: string; weight: number }

const CATEGORIES: { name: string; topics: TopicDef[]; thresholds: [number, number, number] }[] = [
  {
    name: "Violence & Gore",
    // None: 0 / Mild: 1-3 / Moderate: 4-9 / Severe: 10+
    thresholds: [3, 9, 10],
    topics: [
      // Heavy (3)
      { id: 267, label: "Excessive gore", weight: 3 },
      { id: 200, label: "Eye mutilation", weight: 3 },
      { id: 331, label: "Decapitation", weight: 3 },
      { id: 203, label: "Torture", weight: 3 },
      { id: 164, label: "People burned alive", weight: 3 },
      // Medium (2)
      { id: 188, label: "Blood & gore", weight: 2 },
      { id: 232, label: "Gun violence", weight: 2 },
      { id: 296, label: "Body horror", weight: 2 },
      { id: 343, label: "Stabbing", weight: 2 },
      { id: 250, label: "Amputation", weight: 2 },
      { id: 240, label: "Buried alive", weight: 2 },
      // Light (1)
      { id: 223, label: "Head trauma", weight: 1 },
      { id: 282, label: "Crushing", weight: 1 },
      { id: 216, label: "Broken bones", weight: 1 },
      { id: 281, label: "Asphyxiation", weight: 1 },
      { id: 309, label: "Choking", weight: 1 },
      { id: 245, label: "Choking", weight: 1 },
    ],
  },
  {
    name: "Sexual Content",
    // None: 0 / Mild: 1-2 / Moderate: 3-5 / Severe: 6+
    thresholds: [2, 5, 6],
    topics: [
      // Heavy (3)
      { id: 292, label: "Onscreen sexual assault", weight: 3 },
      { id: 279, label: "Nudity", weight: 3 },
      // Medium (2)
      { id: 197, label: "Sexual content", weight: 2 },
      { id: 182, label: "Sexual assault", weight: 2 },
      // Light (1)
      { id: 276, label: "Sexual objectification", weight: 1 },
      { id: 326, label: "Rape mentioned", weight: 1 },
    ],
  },
  {
    name: "Language & Substance",
    // None: 0 / Mild: 1-3 / Moderate: 4-7 / Severe: 8 (all 3 confirmed)
    thresholds: [3, 7, 8],
    topics: [
      // Heavy (3)
      { id: 193, label: "Drug use", weight: 3 },
      { id: 290, label: "Strong language", weight: 3 },
      // Medium (2)
      { id: 225, label: "Alcohol abuse", weight: 2 },
    ],
  },
  {
    name: "Scary & Intense",
    // None: 0 / Mild: 1-3 / Moderate: 4-8 / Severe: 9+
    thresholds: [3, 8, 9],
    topics: [
      // Heavy (3)
      { id: 206, label: "Seizures", weight: 3 },
      { id: 167, label: "Flashing lights", weight: 3 },
      // Medium (2)
      { id: 161, label: "Jump scares", weight: 2 },
      { id: 202, label: "Claustrophobic scenes", weight: 2 },
      // Light (1)
      { id: 339, label: "Loud noises", weight: 1 },
      { id: 366, label: "Screaming", weight: 1 },
      { id: 165, label: "Spiders", weight: 1 },
      { id: 207, label: "Ghosts", weight: 1 },
    ],
  },
  {
    name: "Sensitive Themes",
    // None: 0 / Mild: 1-3 / Moderate: 4-9 / Severe: 10+
    thresholds: [3, 9, 10],
    topics: [
      // Heavy (3)
      { id: 187, label: "Suicide", weight: 3 },
      { id: 199, label: "Self-harm", weight: 3 },
      { id: 330, label: "Abusive parents", weight: 3 },
      // Medium (2)
      { id: 286, label: "Suicide attempt", weight: 2 },
      { id: 168, label: "Parent death", weight: 2 },
      { id: 328, label: "Major character death", weight: 2 },
      { id: 153, label: "Dog dies", weight: 2 },
      { id: 189, label: "Animal death", weight: 2 },
      // Light (1)
      { id: 238, label: "Abortion", weight: 1 },
      { id: 215, label: "Miscarriage", weight: 1 },
    ],
  },
];

interface DDDTopicStat {
  TopicId: number;
  yesSum: number;
  noSum: number;
}

function isConfirmed(yes: number, no: number): boolean {
  if (yes === 0) return false;
  return yes / (yes + no) > 0.7;
}

function getSeverity(score: number, thresholds: [number, number, number]): "none" | "mild" | "moderate" | "severe" {
  if (score === 0) return "none";
  if (score <= thresholds[0]) return "mild";
  if (score <= thresholds[1]) return "moderate";
  return "severe";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);

  if (!DDD_API_KEY) {
    return NextResponse.json({ error: "DDD API not configured" }, { status: 500 });
  }

  try {
    const title = req.nextUrl.searchParams.get("title") ?? "";

    // Step 1: Search DDD and match by TMDB ID
    let dddItemId: number | null = null;

    if (title) {
      const searchRes = await fetch(`${DDD_BASE}/dddsearch?q=${encodeURIComponent(title)}`, {
        headers: { "X-API-KEY": DDD_API_KEY, Accept: "application/json" },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const exactMatch = searchData.items?.find((item: { tmdbid: number }) => item.tmdbid === tmdbId);
        if (exactMatch) dddItemId = exactMatch.id;
      }
    }

    if (!dddItemId) {
      const searchRes = await fetch(`${DDD_BASE}/dddsearch?q=${tmdbId}`, {
        headers: { "X-API-KEY": DDD_API_KEY, Accept: "application/json" },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const match = searchData.items?.find((item: { tmdbid: number }) => item.tmdbid === tmdbId);
        if (match) dddItemId = match.id;
      }
    }

    if (!dddItemId) {
      return NextResponse.json({ categories: null, message: "No data available" });
    }

    // Step 2: Fetch full media data with topic stats
    const mediaRes = await fetch(`${DDD_BASE}/media/${dddItemId}`, {
      headers: { "X-API-KEY": DDD_API_KEY, Accept: "application/json" },
    });
    if (!mediaRes.ok) {
      return NextResponse.json({ categories: null, message: "No data available" });
    }

    const mediaData = await mediaRes.json();
    const allStats: DDDTopicStat[] = mediaData.topicItemStats ?? [];

    const topicVotes = new Map<number, { yes: number; no: number }>();
    for (const s of allStats) {
      topicVotes.set(s.TopicId, { yes: s.yesSum, no: s.noSum });
    }

    // Step 3: Score each category using weighted confirmed topics
    const categories = CATEGORIES.map((cat) => {
      let weightedScore = 0;
      let totalVotes = 0;
      const details: { label: string; yes: number; no: number; weight: number; confirmed: boolean }[] = [];

      for (const topic of cat.topics) {
        const votes = topicVotes.get(topic.id);
        if (!votes) continue;
        const total = votes.yes + votes.no;
        if (total === 0) continue;

        totalVotes += total;
        const confirmed = isConfirmed(votes.yes, votes.no);
        if (confirmed) weightedScore += topic.weight;

        details.push({
          label: topic.label,
          yes: votes.yes,
          no: votes.no,
          weight: topic.weight,
          confirmed,
        });
      }

      // Sort: confirmed first (by weight desc), then unconfirmed by yes count
      details.sort((a, b) => {
        if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
        if (a.confirmed && b.confirmed) return b.weight - a.weight || b.yes - a.yes;
        return b.yes - a.yes;
      });

      // Summary triggers: confirmed topics only, sorted by weight then yes
      const triggers = details
        .filter((d) => d.confirmed)
        .slice(0, 5)
        .map((d) => d.label);

      return {
        category: cat.name,
        severity: getSeverity(weightedScore, cat.thresholds),
        weightedScore,
        triggers,
        details: details.slice(0, 10).map((d) => ({
          label: d.label,
          yes: d.yes,
          no: d.no,
        })),
        totalVotes,
      };
    });

    const totalVoters = Math.max(...allStats.map((s) => s.yesSum + s.noSum), 0);

    // Count how many categories have at least one topic with 10+ votes
    let categoriesWithStrongData = 0;
    for (const cat of categories) {
      const hasStrong = cat.details.some((d) => d.yes + d.no >= 10);
      if (hasStrong) categoriesWithStrongData++;
    }

    return NextResponse.json({
      categories,
      totalVoters,
      limitedData: categoriesWithStrongData < 2,
      source: "DoesTheDogDie.com",
    });
  } catch (err) {
    console.error("Parents guide error:", err);
    return NextResponse.json({ categories: null, message: "Failed to load" });
  }
}
