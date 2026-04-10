"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export default function SpoilerGate({ children }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  return (
    <div className="relative">
      <div className="blur-md select-none pointer-events-none opacity-30">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface)]/80 rounded-xl">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm font-semibold text-white mb-1">Spoiler Warning</p>
        <p className="text-xs text-[var(--foreground-muted)] mb-3">This thread may contain spoilers</p>
        <button
          onClick={() => setRevealed(true)}
          className="px-4 py-1.5 text-sm font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full hover:bg-yellow-500/30 transition-colors"
        >
          Show Content
        </button>
      </div>
    </div>
  );
}
