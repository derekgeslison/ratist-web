/**
 * Local test: hits the DDD API directly with the same algorithm
 * from app/api/movies/[id]/parents-guide/route.ts
 */

require("dotenv").config({ path: ".env.local" });

const DDD_API_KEY = process.env.DDD_API_KEY;
const DDD_BASE = "https://www.doesthedogdie.com";

const CATEGORIES = [
  {
    name: "Violence & Gore",
    thresholds: [3, 6, 9, 12, 12],
    maxContributors: 5,
    topics: [
      { id: 267, label: "Excessive gore", weight: 3 },
      { id: 200, label: "Eye mutilation", weight: 3 },
      { id: 331, label: "Decapitation", weight: 3 },
      { id: 203, label: "Torture", weight: 3 },
      { id: 164, label: "People burned alive", weight: 3 },
      { id: 188, label: "Blood & gore", weight: 2 },
      { id: 232, label: "Gun violence", weight: 2 },
      { id: 296, label: "Body horror", weight: 2 },
      { id: 343, label: "Stabbing", weight: 2 },
      { id: 250, label: "Amputation", weight: 2 },
      { id: 240, label: "Buried alive", weight: 2 },
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
    thresholds: [2, 3.5, 5, 6.5, 6.5],
    maxContributors: 3,
    topics: [
      { id: 292, label: "Onscreen sexual assault", weight: 3 },
      { id: 279, label: "Nudity", weight: 3 },
      { id: 197, label: "Sexual content", weight: 2 },
      { id: 182, label: "Sexual assault", weight: 2 },
      { id: 276, label: "Sexual objectification", weight: 1 },
      { id: 326, label: "Rape mentioned", weight: 1 },
    ],
  },
  {
    name: "Language & Substance",
    thresholds: [2, 4, 6, 7.5, 7.5],
    maxContributors: 3,
    topics: [
      { id: 193, label: "Drug use", weight: 3 },
      { id: 290, label: "Strong language", weight: 3 },
      { id: 225, label: "Alcohol abuse", weight: 2 },
    ],
  },
  {
    name: "Scary & Intense",
    thresholds: [3, 5, 7.5, 9.5, 9.5],
    maxContributors: 4,
    topics: [
      { id: 206, label: "Seizures", weight: 3 },
      { id: 167, label: "Flashing lights", weight: 3 },
      { id: 161, label: "Jump scares", weight: 2 },
      { id: 202, label: "Claustrophobic scenes", weight: 2 },
      { id: 339, label: "Loud noises", weight: 1 },
      { id: 366, label: "Screaming", weight: 1 },
      { id: 165, label: "Spiders", weight: 1 },
      { id: 207, label: "Ghosts", weight: 1 },
    ],
  },
  {
    name: "Sensitive Themes",
    thresholds: [3, 5.5, 8, 10.5, 10.5],
    maxContributors: 5,
    topics: [
      { id: 187, label: "Suicide", weight: 3 },
      { id: 199, label: "Self-harm", weight: 3 },
      { id: 330, label: "Abusive parents", weight: 3 },
      { id: 286, label: "Suicide attempt", weight: 2 },
      { id: 168, label: "Parent death", weight: 2 },
      { id: 328, label: "Major character death", weight: 2 },
      { id: 153, label: "Dog dies", weight: 2 },
      { id: 189, label: "Animal death", weight: 2 },
      { id: 238, label: "Abortion", weight: 1 },
      { id: 215, label: "Miscarriage", weight: 1 },
    ],
  },
];

const HIGH_VOTE_THRESHOLD = 20;

function isConfirmed(yes, no) {
  const total = yes + no;
  if (total < 3) return false;
  return yes / total > 0.7;
}

function confirmationStrength(yes, no) {
  const total = yes + no;
  if (total < 3) return 0;
  const ratio = yes / total;
  if (ratio <= 0.7) return 0;
  // High-vote topics with 90%+ yes: strength = yes ratio (0.90 to 1.0)
  if (total >= HIGH_VOTE_THRESHOLD && ratio >= 0.9) return ratio;
  // Low-vote or sub-90%: dampened scale, capped at 0.89
  return Math.min(0.89, (ratio - 0.7) / 0.3);
}

function getSeverity(score, thresholds) {
  if (score === 0) return "none";
  if (score <= thresholds[0]) return "mild";
  if (score <= thresholds[1]) return "mild-mod";
  if (score <= thresholds[2]) return "moderate";
  if (score <= thresholds[3]) return "mod-sev";
  return "severe";
}

function scoreTitle(topicVotes, label) {
  const results = CATEGORIES.map((cat) => {
    const contributions = [];
    const confirmedTopics = [];

    for (const topic of cat.topics) {
      const votes = topicVotes.get(topic.id);
      if (!votes) continue;
      const total = votes.yes + votes.no;
      if (total === 0) continue;

      const confirmed = isConfirmed(votes.yes, votes.no);
      if (confirmed) {
        const strength = confirmationStrength(votes.yes, votes.no);
        const effective = topic.weight * strength;
        contributions.push(effective);
        confirmedTopics.push({ label: topic.label, weight: topic.weight, strength: strength.toFixed(2), effective: effective.toFixed(2), yes: votes.yes, no: votes.no });
      }
    }

    contributions.sort((a, b) => b - a);
    const capped = contributions.slice(0, cat.maxContributors);
    const weightedScore = capped.reduce((sum, w) => sum + w, 0);
    const severity = getSeverity(weightedScore, cat.thresholds);

    return { name: cat.name, severity, score: weightedScore.toFixed(2), confirmedCount: confirmedTopics.length, cappedTo: cat.maxContributors, topics: confirmedTopics };
  });

  return results;
}

async function fetchDDD(tmdbId, title) {
  let dddItemId = null;

  const searchRes = await fetch(`${DDD_BASE}/dddsearch?q=${encodeURIComponent(title)}`, {
    headers: { "X-API-KEY": DDD_API_KEY, Accept: "application/json" },
  });
  if (searchRes.ok) {
    const data = await searchRes.json();
    const match = data.items?.find((item) => item.tmdbid === tmdbId);
    if (match) dddItemId = match.id;
  }

  if (!dddItemId) return null;

  const mediaRes = await fetch(`${DDD_BASE}/media/${dddItemId}`, {
    headers: { "X-API-KEY": DDD_API_KEY, Accept: "application/json" },
  });
  if (!mediaRes.ok) return null;

  const mediaData = await mediaRes.json();
  const allStats = mediaData.topicItemStats ?? [];
  const topicVotes = new Map();
  for (const s of allStats) {
    topicVotes.set(s.TopicId, { yes: s.yesSum, no: s.noSum });
  }
  return topicVotes;
}

const TEST_CASES = [
  { id: 862, title: "Toy Story", expected: "G" },
  { id: 12, title: "Finding Nemo", expected: "G" },
  { id: 8587, title: "The Lion King", expected: "G" },
  { id: 808, title: "Shrek", expected: "PG" },
  { id: 671, title: "Harry Potter and the Philosopher's Stone", expected: "PG" },
  { id: 9806, title: "The Incredibles", expected: "PG" },
  { id: 155, title: "The Dark Knight", expected: "PG-13" },
  { id: 329, title: "Jurassic Park", expected: "PG-13" },
  { id: 19995, title: "Avatar", expected: "PG-13" },
  { id: 680, title: "Pulp Fiction", expected: "R" },
  { id: 238, title: "The Godfather", expected: "R" },
  { id: 603, title: "The Matrix", expected: "R" },
  { id: 387, title: "SpongeBob SquarePants", expected: "TV-Y7" },
  { id: 456, title: "The Simpsons", expected: "TV-PG" },
  { id: 1668, title: "Friends", expected: "TV-PG" },
  { id: 66732, title: "Stranger Things", expected: "TV-14" },
  { id: 1399, title: "Game of Thrones", expected: "TV-MA" },
  { id: 1396, title: "Breaking Bad", expected: "TV-MA" },
];

async function main() {
  if (!DDD_API_KEY) { console.error("DDD_API_KEY not set"); process.exit(1); }

  console.log("Testing parents' guide algorithm locally...\n");
  console.log("Rating  | Title                                    | Violence | Sexual   | Language | Scary    | Sensitive");
  console.log("--------|------------------------------------------|----------|----------|----------|----------|----------");

  for (const t of TEST_CASES) {
    const topicVotes = await fetchDDD(t.id, t.title);
    if (!topicVotes) {
      console.log(`${t.expected.padEnd(7)} | ${t.title.padEnd(40)} | NO DATA`);
      continue;
    }
    const results = scoreTitle(topicVotes, t.title);
    const cols = results.map(r => `${r.severity.padEnd(8)} ${r.score.padStart(5)}`);
    console.log(`${t.expected.padEnd(7)} | ${t.title.padEnd(40)} | ${cols.join(" | ")}`);
  }

  // Detailed output for problem cases
  console.log("\n\n=== DETAILED: Problem Cases ===\n");
  for (const t of [
    { id: 862, title: "Toy Story", expected: "G" },
    { id: 387, title: "SpongeBob SquarePants", expected: "TV-Y7" },
    { id: 456, title: "The Simpsons", expected: "TV-PG" },
    { id: 1668, title: "Friends", expected: "TV-PG" },
  ]) {
    const topicVotes = await fetchDDD(t.id, t.title);
    if (!topicVotes) continue;
    const results = scoreTitle(topicVotes, t.title);
    console.log(`--- ${t.title} (${t.expected}) ---`);
    for (const r of results) {
      console.log(`  ${r.name}: ${r.severity.toUpperCase()} (score: ${r.score}, ${r.confirmedCount} confirmed, capped to ${r.cappedTo})`);
      for (const topic of r.topics.slice(0, 5)) {
        console.log(`    ${topic.label}: wt=${topic.weight} str=${topic.strength} eff=${topic.effective} (${topic.yes}y/${topic.no}n)`);
      }
    }
    console.log("");
  }
}

main().catch(console.error);
