"use client";

import { useState } from "react";

export default function CelebrityBio({ biography }: { biography: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <p className={`text-sm text-[var(--foreground-muted)] leading-relaxed ${expanded ? "" : "line-clamp-5"}`}>
        {biography}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-[var(--ratist-red)] hover:underline mt-1"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}
