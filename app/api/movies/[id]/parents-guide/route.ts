import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DDD_API_KEY = process.env.DDD_API_KEY;
const DDD_BASE = "https://www.doesthedogdie.com";

// Map DDD topic IDs to our 5 parents' guide categories (curated)
const CATEGORY_MAP: Record<string, number[]> = {
  "Violence & Gore": [
    188, // blood or gore
    232, // gun violence
    267, // excessive gore
    200, // eye mutilation
    164, // burned alive
    223, // heads squashed
    331, // decapitation
    282, // crushed to death
    203, // torture
    296, // body horror
    343, // stabbings
    250, // amputation
    216, // bones breaking
    281, // asphyxiation
    309, // chokings
    245, // choking
    240, // buried alive
  ],
  "Sexual Content": [
    197, // sexual content
    279, // nude scenes
    276, // sexual objectification
    292, // onscreen sexual assault
    182, // sexual assault
    326, // rape mentions
  ],
  "Language & Substance": [
    193, // drug use
    225, // alcohol abuse
    290, // obscene language/gestures
  ],
  "Scary & Intense": [
    161, // jump scares
    167, // flashing lights
    339, // sudden loud noises
    366, // screaming
    202, // claustrophobic scenes
    207, // ghosts
    206, // seizures (medical/sensory concern)
    165, // spiders
  ],
  "Sensitive Themes": [
    187, // suicide
    286, // suicide attempts
    199, // self harm
    168, // parents dying
    328, // major character dies
    153, // dog dies
    189, // animals dying
    330, // abusive parents
    238, // abortions
    215, // miscarriages
  ],
};

// Friendly labels for each topic
const TOPIC_LABELS: Record<number, string> = {
  188: "Blood & gore", 232: "Gun violence", 267: "Excessive gore",
  200: "Eye mutilation", 164: "People burned alive", 223: "Head trauma",
  331: "Decapitation", 282: "Crushing", 203: "Torture",
  296: "Body horror", 343: "Stabbing", 250: "Amputation",
  216: "Broken bones", 281: "Asphyxiation", 309: "Choking",
  245: "Choking", 240: "Buried alive",
  197: "Sexual content", 279: "Nudity", 276: "Sexual objectification",
  292: "Onscreen sexual assault", 182: "Sexual assault", 326: "Rape mentioned",
  193: "Drug use", 225: "Alcohol abuse", 290: "Strong language",
  161: "Jump scares", 167: "Flashing lights", 339: "Loud noises",
  366: "Screaming", 202: "Claustrophobic scenes", 207: "Ghosts",
  206: "Seizures",
  187: "Suicide", 286: "Suicide attempt", 199: "Self-harm",
  168: "Parent death", 328: "Major character death",
  153: "Dog dies", 189: "Animal death",
  330: "Abusive parents", 238: "Abortion", 215: "Miscarriage",
  165: "Spiders",
};

interface DDDTopicStat {
  TopicId: number;
  yesSum: number;
  noSum: number;
  topic: { id: number; doesName: string; name: string; smmwDescription?: string };
  TopicCategory: { name: string };
}

function getSeverity(yesTotal: number, noTotal: number): "none" | "mild" | "moderate" | "severe" {
  if (yesTotal === 0) return "none";
  const ratio = yesTotal / (yesTotal + noTotal);
  if (ratio < 0.3 || yesTotal < 3) return "mild";
  if (ratio < 0.7) return "moderate";
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

    // Try searching by title (more reliable than searching by ID)
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

    // Fallback: search by TMDB ID number
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
    const stats: DDDTopicStat[] = mediaData.topicItemStats ?? [];

    // Build a lookup of topic ID → votes
    const topicVotes = new Map<number, { yes: number; no: number }>();
    for (const s of stats) {
      topicVotes.set(s.TopicId, { yes: s.yesSum, no: s.noSum });
    }

    // Step 3: Aggregate into our 5 categories
    const categories = Object.entries(CATEGORY_MAP).map(([category, topicIds]) => {
      let totalYes = 0;
      let totalNo = 0;
      const details: { label: string; yes: number; no: number }[] = [];

      for (const tid of topicIds) {
        const votes = topicVotes.get(tid);
        if (!votes) continue;
        totalYes += votes.yes;
        totalNo += votes.no;
        // Include in details if it has any votes at all
        if (votes.yes > 0 || votes.no > 0) {
          details.push({
            label: TOPIC_LABELS[tid] ?? `Topic ${tid}`,
            yes: votes.yes,
            no: votes.no,
          });
        }
      }

      details.sort((a, b) => b.yes - a.yes);

      // Top triggers for the summary line (only items where yes > no)
      const triggers = details
        .filter((d) => d.yes > d.no)
        .slice(0, 5)
        .map((d) => d.label);

      return {
        category,
        severity: getSeverity(totalYes, totalNo),
        triggers,
        details: details.slice(0, 10),
        totalVotes: totalYes + totalNo,
      };
    });

    const totalVoters = Math.max(...stats.map((s) => s.yesSum + s.noSum), 0);

    return NextResponse.json({
      categories,
      totalVoters,
      source: "DoesTheDogDie.com",
    });
  } catch (err) {
    console.error("Parents guide error:", err);
    return NextResponse.json({ categories: null, message: "Failed to load" });
  }
}
