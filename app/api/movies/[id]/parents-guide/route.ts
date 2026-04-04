import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DDD_API_KEY = process.env.DDD_API_KEY;
const DDD_BASE = "https://www.doesthedogdie.com";

// Map DDD topic IDs to our 5 parents' guide categories
// Built from DDD's TopicCategory groupings + manual curation
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
    177, // shaving/cutting
    203, // torture
    296, // body horror
    171, // finger/toe mutilation
    343, // stabbings
    250, // amputation
    216, // bones breaking
    281, // asphyxiation
    309, // chokings
    245, // choking
    206, // seizures
    298, // unconscious
    240, // buried alive
    367, // women brutalized
    255, // audio gore
  ],
  "Sexual Content": [
    197, // sexual content
    279, // nude scenes
    276, // sexual objectification
    292, // onscreen sexual assault
    182, // sexual assault
    326, // rape mentions
    315, // sexual assault jokes
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
    181, // shaky cam
    366, // screaming
    202, // claustrophobic scenes
    312, // trypophobia
    207, // ghosts
    165, // spiders
    213, // bugs
    214, // snakes
    337, // sharks
    335, // bodies of water
    356, // underwater scenes
  ],
  "Sensitive Themes": [
    187, // suicide
    286, // suicide attempts
    199, // self harm
    168, // parents dying
    313, // family dies
    328, // major character dies
    311, // someone dies
    289, // self-sacrifice
    305, // non-human death
    238, // abortions
    228, // childbirth
    215, // miscarriages
    239, // pregnant people deaths
    266, // babies/unborn
    235, // anxiety attacks
    348, // meltdowns
    195, // body dysmorphia
    334, // reality unhinged
    153, // dog dies
    189, // animals dying
    330, // abusive parents
    237, // gaslighting
    212, // hate speech
    351, // religion discussed
    299, // druggings
    274, // restraints
  ],
};

// Friendly label for each topic (extracted from DDD's doesName/smmwDescription)
const TOPIC_LABELS: Record<number, string> = {
  188: "Blood & gore", 232: "Gun violence", 267: "Excessive gore",
  200: "Eye mutilation", 164: "People burned alive", 223: "Head trauma",
  331: "Decapitation", 282: "Crushing", 177: "Cutting/shaving",
  203: "Torture", 296: "Body horror", 171: "Finger/toe injury",
  343: "Stabbing", 250: "Amputation", 216: "Broken bones",
  281: "Asphyxiation", 309: "Choking", 245: "Choking",
  206: "Seizures", 298: "Unconsciousness", 240: "Buried alive",
  367: "Brutalization", 255: "Audio gore",
  197: "Sexual content", 279: "Nudity", 276: "Sexual objectification",
  292: "Onscreen sexual assault", 182: "Sexual assault", 326: "Rape mentioned",
  315: "SA jokes",
  193: "Drug use", 225: "Alcohol abuse", 290: "Strong language",
  161: "Jump scares", 167: "Flashing lights", 339: "Loud noises",
  181: "Shaky cam", 366: "Screaming", 202: "Claustrophobic scenes",
  312: "Trypophobia", 207: "Ghosts", 165: "Spiders",
  213: "Bugs", 214: "Snakes", 337: "Sharks",
  335: "Open water", 356: "Underwater scenes",
  187: "Suicide", 286: "Suicide attempt", 199: "Self-harm",
  168: "Parent death", 313: "Family death", 328: "Major character death",
  311: "Someone dies", 289: "Self-sacrifice", 305: "Non-human death",
  238: "Abortion", 228: "Childbirth", 215: "Miscarriage",
  239: "Pregnant person dies", 266: "Babies/unborn",
  235: "Anxiety/panic attacks", 348: "Meltdowns", 195: "Body dysmorphia",
  334: "Unstable reality", 153: "Dog dies", 189: "Animal death",
  330: "Abusive parents", 237: "Gaslighting", 212: "Hate speech",
  351: "Religion discussed", 299: "Drugging", 274: "Restraints",
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
        // Match by TMDB ID first
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
      const triggers: { label: string; yes: number; no: number }[] = [];

      for (const tid of topicIds) {
        const votes = topicVotes.get(tid);
        if (!votes) continue;
        totalYes += votes.yes;
        totalNo += votes.no;
        if (votes.yes > 0 && votes.yes > votes.no) {
          triggers.push({
            label: TOPIC_LABELS[tid] ?? `Topic ${tid}`,
            yes: votes.yes,
            no: votes.no,
          });
        }
      }

      triggers.sort((a, b) => b.yes - a.yes);

      return {
        category,
        severity: getSeverity(totalYes, totalNo),
        triggers: triggers.slice(0, 5).map((t) => t.label),
        totalVotes: totalYes + totalNo,
      };
    });

    // Sort by severity (severe first)
    const severityOrder = { severe: 0, moderate: 1, mild: 2, none: 3 };
    categories.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

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
