"use client";

import { Trophy } from "lucide-react";

interface Participant {
  userId: string;
  user: { name: string };
}

interface Prediction {
  userId: string;
  ratingGuess: number | null;
}

interface Rating {
  userId: string;
  ratistRating: number | null;
  overallRating: number | null;
  reviewText: string | null;
}

interface Poll {
  creator: { id: string };
}

interface Bookmark {
  userId: string;
}

interface ChatMsg {
  userId: string;
}

interface Props {
  participants: Participant[];
  predictions: Prediction[];
  ratings: Rating[];
  polls: Poll[];
  bookmarks: Bookmark[];
  chatMessages: ChatMsg[];
  pauseRequestCounts: Record<string, number>; // userId -> count
}

interface Award {
  title: string;
  emoji: string;
  winner: string;
  detail: string;
}

export default function ScreeningSuperlatives({ participants, predictions, ratings, polls, bookmarks, chatMessages, pauseRequestCounts }: Props) {
  const nameMap = new Map(participants.map((p) => [p.userId, p.user.name]));
  const getName = (id: string) => nameMap.get(id) ?? "Unknown";

  const awards: Award[] = [];

  // Biggest Surprise — prediction vs actual, largest gap
  const surprises: { userId: string; gap: number }[] = [];
  for (const pred of predictions) {
    if (pred.ratingGuess == null) continue;
    const rating = ratings.find((r) => r.userId === pred.userId);
    const actual = rating?.ratistRating ?? rating?.overallRating;
    if (actual == null) continue;
    surprises.push({ userId: pred.userId, gap: Math.abs(pred.ratingGuess - actual) });
  }
  if (surprises.length > 0) {
    surprises.sort((a, b) => b.gap - a.gap);
    const winner = surprises[0];
    if (winner.gap >= 0.5) {
      awards.push({
        title: "Biggest Surprise",
        emoji: "😮",
        winner: getName(winner.userId),
        detail: `Off by ${winner.gap.toFixed(1)} points`,
      });
    }
  }

  // Closest Call — prediction vs actual, smallest gap
  if (surprises.length > 0) {
    surprises.sort((a, b) => a.gap - b.gap);
    const winner = surprises[0];
    awards.push({
      title: "Closest Call",
      emoji: "🎯",
      winner: getName(winner.userId),
      detail: winner.gap === 0 ? "Nailed it!" : `Only ${winner.gap.toFixed(1)} off`,
    });
  }

  // Chatty One — most chat messages
  const chatCounts = new Map<string, number>();
  for (const msg of chatMessages) {
    if (msg.userId === "system") continue;
    chatCounts.set(msg.userId, (chatCounts.get(msg.userId) ?? 0) + 1);
  }
  if (chatCounts.size > 0) {
    const sorted = [...chatCounts.entries()].sort(([, a], [, b]) => b - a);
    const [winnerId, count] = sorted[0];
    if (count >= 3) {
      awards.push({
        title: "Chatty One",
        emoji: "💬",
        winner: getName(winnerId),
        detail: `${count} messages`,
      });
    }
  }

  // The Director — most polls + bookmarks combined
  const directorCounts = new Map<string, number>();
  for (const poll of polls) {
    const creatorId = poll.creator.id;
    directorCounts.set(creatorId, (directorCounts.get(creatorId) ?? 0) + 1);
  }
  for (const bm of bookmarks) {
    directorCounts.set(bm.userId, (directorCounts.get(bm.userId) ?? 0) + 1);
  }
  if (directorCounts.size > 0) {
    const sorted = [...directorCounts.entries()].sort(([, a], [, b]) => b - a);
    const [winnerId, count] = sorted[0];
    if (count >= 2) {
      awards.push({
        title: "The Director",
        emoji: "🎬",
        winner: getName(winnerId),
        detail: `${count} polls & bookmarks`,
      });
    }
  }

  // Intermission King/Queen — most pause requests
  if (Object.keys(pauseRequestCounts).length > 0) {
    const sorted = Object.entries(pauseRequestCounts).sort(([, a], [, b]) => b - a);
    const [winnerId, count] = sorted[0];
    if (count >= 2) {
      awards.push({
        title: "Intermission Royalty",
        emoji: "⏸️",
        winner: getName(winnerId),
        detail: `${count} pause requests`,
      });
    }
  }

  // The Quiet One — fewest messages
  if (chatCounts.size > 0 && participants.length > 1) {
    // Include participants with 0 messages
    let minId = "";
    let minCount = Infinity;
    for (const p of participants) {
      const count = chatCounts.get(p.userId) ?? 0;
      if (count < minCount) { minCount = count; minId = p.userId; }
    }
    if (minId) {
      awards.push({
        title: "The Quiet One",
        emoji: "🤫",
        winner: getName(minId),
        detail: minCount === 0 ? "Zero messages" : `Only ${minCount} message${minCount !== 1 ? "s" : ""}`,
      });
    }
  }

  if (awards.length === 0) return null;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-[var(--ratist-red)]" /> Superlatives
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {awards.map((award) => (
          <div key={award.title} className="bg-[var(--surface-2)] rounded-lg p-4 text-center">
            <span className="text-2xl">{award.emoji}</span>
            <p className="text-[10px] text-[var(--ratist-red)] font-medium mt-1 uppercase tracking-wider">{award.title}</p>
            <p className="text-sm font-bold text-white mt-1">{award.winner}</p>
            <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{award.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
