"use client";

import { useEffect, useState } from "react";

interface Quote {
  text: string;
  attribution: string;
}

// Iconic "lost / wrong place / missing" movie moments. One picked at random
// per page load. Keep these reverent — Ratist is cinephile-authentic, not
// meme-first.
const QUOTES: Quote[] = [
  { text: "I've got a feeling we're not in Kansas anymore.", attribution: "Dorothy — The Wizard of Oz" },
  { text: "You shall not pass.", attribution: "Gandalf — The Fellowship of the Ring" },
  { text: "Houston, we have a problem.", attribution: "Jim Lovell — Apollo 13" },
  { text: "I'll be back.", attribution: "The Terminator" },
  { text: "In space, no one can hear you scream.", attribution: "Alien" },
  { text: "Roads? Where we're going we don't need roads.", attribution: "Doc Brown — Back to the Future" },
  { text: "You're gonna need a bigger boat.", attribution: "Chief Brody — Jaws" },
  { text: "I have a very particular set of skills — but finding this page is not one of them.", attribution: "With apologies to Taken" },
  { text: "Life finds a way. This URL did not.", attribution: "With apologies to Jurassic Park" },
  { text: "What we've got here is… failure to locate.", attribution: "With apologies to Cool Hand Luke" },
  { text: "That'll do, pig. That'll do.", attribution: "Babe" },
  { text: "You talkin' to me? Well, there's no one else here.", attribution: "Taxi Driver" },
  { text: "I'm just a kid from Brooklyn looking for a different URL.", attribution: "With apologies to Captain America" },
  { text: "Toto, I've a feeling we typed the wrong link.", attribution: "With apologies to The Wizard of Oz" },
  { text: "Sometimes the URL you want isn't the URL you need.", attribution: "With apologies to The Dark Knight" },
];

export default function NotFoundQuote() {
  // Render the first quote on SSR for a deterministic hydrate, then swap to a
  // random pick on the client. The brief flash is acceptable for a 404.
  const [quote, setQuote] = useState<Quote>(QUOTES[0]);
  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);
  return (
    <div className="max-w-2xl mx-auto text-center">
      <p className="text-2xl sm:text-3xl lg:text-4xl font-serif italic text-white leading-tight mb-4">
        &ldquo;{quote.text}&rdquo;
      </p>
      <p className="text-sm text-[var(--foreground-muted)] uppercase tracking-wider">
        — {quote.attribution}
      </p>
    </div>
  );
}
