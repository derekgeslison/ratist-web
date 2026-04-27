"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";

// Lazy-load the picker — its emoji data is ~100KB. Only fetched when a
// user actually clicks the smile button, so the comments framework stays
// cheap to mount on every page that has comments.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-xs text-[var(--foreground-muted)]">
      Loading…
    </div>
  ),
});

interface Props {
  onSelect: (emoji: string) => void;
  /** Where the popover anchors relative to the button. Defaults to "top-right". */
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  className?: string;
}

export default function EmojiButton({ onSelect, position = "top-right", className }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape so the popover can't strand itself
  // open when users navigate away with mouse or keyboard.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Position classes — pick whichever corner has the most room. Comments
  // render at the bottom of pages most often, so top-right is the default.
  const popPos =
    position === "top-right" ? "bottom-full mb-2 right-0"
    : position === "top-left" ? "bottom-full mb-2 left-0"
    : position === "bottom-right" ? "top-full mt-2 right-0"
    : "top-full mt-2 left-0";

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
        title="Add emoji"
        aria-label="Add emoji"
      >
        <Smile className="w-4 h-4" />
      </button>
      {open && (
        <div className={`absolute z-50 ${popPos}`}>
          <EmojiPicker
            onEmojiClick={(data) => {
              onSelect(data.emoji);
              setOpen(false);
            }}
            theme={"dark" as never /* runtime accepts the string; SSR types are fussy */}
            width={300}
            height={380}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}
