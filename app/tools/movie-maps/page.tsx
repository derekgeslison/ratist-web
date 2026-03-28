"use client";

import { useState } from "react";
import Image from "next/image";
import { Map, Search, ChevronDown, ChevronUp } from "lucide-react";

interface MovieMap {
  tmdbId: number;
  title: string;
  year: string;
  director: string;
  poster: string;
  description: string;
  sections: { label: string; content: string }[];
}

// Curated plot maps for notoriously complex films
const MOVIE_MAPS: MovieMap[] = [
  {
    tmdbId: 37799,
    title: "Memento",
    year: "2000",
    director: "Christopher Nolan",
    poster: "/yuNs09byH5XkGIYNVFmrfCsXMSf.jpg",
    description: "Two interweaving timelines told in reverse (color) and forward (black & white). The color sequences run backwards; the B&W sequences run forwards and fill in the gaps.",
    sections: [
      { label: "B&W Timeline (Chronological)", content: "Leonard wakes up in a motel → calls an unknown person → recounts Sammy Jankis story → discovers he IS Sammy Jankis → Jimmy Grantz is killed → Teddy reveals the truth → Leonard burns evidence and drives off." },
      { label: "Color Timeline (Reverse)", content: "Opens with Leonard killing Teddy → each scene ends where the previous scene began → builds backward to the morning Leonard woke up at the motel." },
      { label: "Key Twist", content: "Leonard's wife survived the attack. He gave her insulin injections repeatedly (as 'Sammy Jankis' did in his memory). He has been manipulated by Teddy into killing drug dealers, then erasing the memory. The license plate 'facts' he's tattooed are lies he's told himself." },
    ],
  },
  {
    tmdbId: 264644,
    title: "Mulholland Drive",
    year: "2001",
    director: "David Lynch",
    poster: "/r3XXbhH6DtQFPBdVJvfj3bY2mEt.jpg",
    description: "The film splits into two realities. The first 2/3 is Diane Selwyn's wish-fulfillment dream; the final act is the grim reality she's escaped from.",
    sections: [
      { label: "Dream World (Acts 1–2)", content: "Betty (idealized Diane) arrives in Hollywood full of hope → meets amnesiac Rita → they investigate Rita's identity → find Diane Selwyn's dead body → discover 'Camilla Rhodes' → blue box opens." },
      { label: "Real World (Act 3)", content: "Diane hired a hitman to kill Camilla out of jealous obsession → Camilla is alive and flaunting her success → Diane descends into guilt, paranoia, and eventually suicide." },
      { label: "Symbol Key", content: "Blue key = hit has been completed / Blue box = Pandora's box of repressed truth / Silencio = nothing is real, it's all a performance / The Cowboy = Diane's guilt/subconscious directing the dream." },
    ],
  },
  {
    tmdbId: 27205,
    title: "Inception",
    year: "2010",
    director: "Christopher Nolan",
    poster: "/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg",
    description: "Five nested dream levels, each with a different time dilation. The deeper you go, the slower time moves relative to reality.",
    sections: [
      { label: "Dream Level Map", content: "Reality: Fischer's flight (10 hrs) → Level 1: Van chase / rainy city (≈1 week) → Level 2: Hotel zero-gravity (≈6 months) → Level 3: Snow fortress (≈10 years) → Limbo: years/decades." },
      { label: "The Mission", content: "Cobb must plant the idea in Fischer's mind that he should dissolve his father's empire. The idea must feel like Fischer's own. Each level plants a layer of the emotional logic: the safe combination, the will, the love." },
      { label: "The Top", content: "Before the cut — the top is wobbling (it would fall = reality). After Mal's death, Cobb's totem was actually her spinning top. His real totem was his wedding ring (worn in dreams, absent in reality). In the final scene: no ring." },
    ],
  },
  {
    tmdbId: 314,
    title: "Eternal Sunshine of the Spotless Mind",
    year: "2004",
    director: "Michel Gondry",
    poster: "/5MwkWH9tYHv3mV9OqYlasXLBDlJ.jpg",
    description: "The film moves through Joel's memories in reverse order as Lacuna Inc. erases them, with Joel fighting to preserve the last ones.",
    sections: [
      { label: "Erasure Order", content: "Erasure begins with most recent (painful) memories → works backward to first meeting → as Joel reaches happy early memories he decides he wants to keep them → too late, the process nears completion." },
      { label: "Parallel Present", content: "While Joel's memories are erased, Lacuna tech Patrick steals Joel's memories to court Clementine. Mary (receptionist) discovers she herself had her memory erased after an affair with Dr. Mierzwiak." },
      { label: "The Ending", content: "Joel and Clementine receive their own erasure records in the mail. They listen to themselves describing each other's flaws. They decide to try again anyway — knowing it will likely end the same way. 'Okay.' / 'Okay.'" },
    ],
  },
  {
    tmdbId: 2108,
    title: "Synecdoche, New York",
    year: "2008",
    director: "Charlie Kaufman",
    poster: "/cV57TZdMhXUFthlRJV4WMh9RVaN.jpg",
    description: "Time becomes increasingly elastic as Caden Cotard builds an endlessly recursive life-simulation inside a warehouse. The film spans decades while feeling like a day.",
    sections: [
      { label: "The Simulation", content: "Caden builds a replica of New York inside a warehouse → hires actors to play himself and everyone he knows → the replica expands to contain replicas of itself → time compression accelerates → the simulation becomes larger than the real city." },
      { label: "Death Motif", content: "Caden is obsessed with his own mortality from the opening scene. Every character is dying. The number of funerals increases as the film progresses. Eventually Caden begins following Millicent, who is playing his own role." },
      { label: "The Synecdoche", content: "A synecdoche uses a part to represent a whole (or vice versa). The warehouse is a part of New York representing all of New York. Caden is a part of humanity representing all of humanity. The play is a part of life representing all of life." },
    ],
  },
  {
    tmdbId: 1422,
    title: "The Prestige",
    year: "2006",
    director: "Christopher Nolan",
    poster: "/bdN3gXuIZYaJP6z9sMfdNgMEP7f.jpg",
    description: "Structured as a magic trick: The Pledge, The Turn, The Prestige. Three interlocking timelines told through nested diary-reading.",
    sections: [
      { label: "Three-Act Trick Structure", content: "The Pledge: two rival magicians, a tragic accident, obsession begins. The Turn: each sabotages the other, Angier travels to Tesla, Borden builds his secret. The Prestige: both perform the transported man — the reveals collide." },
      { label: "The Twin Secret", content: "Borden (and his twin Fallon) have always shared one identity. They alternate as 'Borden' and his assistant. Each sacrificed half a life. One loved Sarah; one loved Olivia. This is why he said 'I don't know' about loving her." },
      { label: "Angier's Secret", content: "Tesla built Angier a real teleportation/duplication machine. Every night Angier performs the trick, a clone is created. The original falls into a water tank under the stage and drowns. Angier drowned himself every night — each performance a suicide." },
    ],
  },
];

function MovieMapCard({ map }: { map: MovieMap }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-4 text-left"
      >
        <div className="relative w-12 h-18 shrink-0">
          <div className="relative w-12 h-[72px] rounded overflow-hidden bg-[var(--surface-2)]">
            <Image
              src={`https://image.tmdb.org/t/p/w92${map.poster}`}
              alt={map.title}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{map.title}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{map.year} · {map.director}</p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1 line-clamp-2">{map.description}</p>
        </div>
        <div className="shrink-0 text-[var(--foreground-muted)]">
          {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-5 space-y-5">
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{map.description}</p>
          {map.sections.map((section) => (
            <div key={section.label}>
              <h4 className="text-sm font-semibold text-[var(--ratist-red)] mb-2">{section.label}</h4>
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MovieMapsPage() {
  const [query, setQuery] = useState("");
  const filtered = MOVIE_MAPS.filter((m) =>
    !query || m.title.toLowerCase().includes(query.toLowerCase()) || m.director.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Map className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Movie Maps</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">
        Visual plot guides for complex, mind-bending films. Click any film to expand its map.
      </p>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or director..."
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((map) => (
          <MovieMapCard key={map.tmdbId} map={map} />
        ))}
        {filtered.length === 0 && (
          <p className="text-[var(--foreground-muted)] text-center py-10">No maps found for &quot;{query}&quot;.</p>
        )}
      </div>

      <div className="mt-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-sm text-[var(--foreground-muted)]">
        <p className="font-semibold text-white mb-1">More maps coming soon</p>
        <p>Planned: 2001: A Space Odyssey, Lost Highway, Primer, Interstellar, The Tree of Life, Annihilation, and more. Community-submitted maps are on the roadmap.</p>
      </div>
    </div>
  );
}
