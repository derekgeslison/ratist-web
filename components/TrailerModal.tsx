"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  trailerKey: string;
  onClose: () => void;
}

export default function TrailerModal({ trailerKey, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl aspect-video"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm"
          aria-label="Close trailer"
        >
          <X className="w-5 h-5" /> Close
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`}
          className="w-full h-full rounded-xl"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Movie Trailer"
        />
      </div>
    </div>
  );
}
