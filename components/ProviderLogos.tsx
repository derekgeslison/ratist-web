"use client";

import { useState } from "react";
import { IMAGE_BASE_URL } from "@/lib/tmdb";

export interface ProviderInfo {
  name: string;
  logo: string; // TMDB logo_path e.g. "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
}

interface Props {
  providers: ProviderInfo[];
  size?: number;
  label?: "Stream" | "Rent";
}

export default function ProviderLogos({ providers, size = 20, label }: Props) {
  const [tappedIdx, setTappedIdx] = useState<number | null>(null);

  const valid = providers.filter((p) => p.logo);
  if (!valid.length) return null;

  return (
    <div className="flex items-center gap-1 relative">
      {label && (
        <span className={`text-[10px] font-medium mr-0.5 ${label === "Stream" ? "text-green-400" : "text-blue-400"}`}>
          {label}
        </span>
      )}
      {valid.map((p, i) => (
        <span key={`${p.name}-${i}`} className="relative">
          <img
            src={`${IMAGE_BASE_URL}/w92${p.logo}`}
            alt={p.name}
            title={p.name}
            width={size}
            height={size}
            className="rounded-[4px] cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTappedIdx(tappedIdx === i ? null : i);
            }}
          />
          {tappedIdx === i && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[var(--surface)] border border-[var(--border)] text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-30 pointer-events-none">
              {p.name}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
