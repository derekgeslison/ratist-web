"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  className?: string;
}

const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 380;
const MARGIN = 8;

interface Pos { top: number; left: number }

export default function EmojiButton({ onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Compute position when opening, on resize, or on scroll. The popover
  // anchors above-and-right of the button by default and flips below /
  // shifts horizontally if it would clip the viewport. Width is capped
  // at the viewport so phones with very narrow widths don't get cut.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(PICKER_WIDTH, vw - MARGIN * 2);
      const h = Math.min(PICKER_HEIGHT, vh - MARGIN * 2);

      let top = rect.top - h - MARGIN;
      // Flip below the button if there isn't room above.
      if (top < MARGIN) top = rect.bottom + MARGIN;

      let left = rect.right - w;
      if (left < MARGIN) left = MARGIN;
      if (left + w > vw - MARGIN) left = vw - w - MARGIN;

      setPos({ top, left });
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  // Close on outside click + Escape. Outside = anywhere that isn't the
  // button or the popover content (which lives in a portal, so we check
  // both refs explicitly).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors ${className ?? ""}`}
        title="Add emoji"
        aria-label="Add emoji"
      >
        <Smile className="w-4 h-4" />
      </button>
      {mounted && open && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100 }}
        >
          <EmojiPicker
            onEmojiClick={(data) => {
              onSelect(data.emoji);
              setOpen(false);
            }}
            theme={"dark" as never /* runtime accepts the string; SSR types are fussy */}
            width={Math.min(PICKER_WIDTH, typeof window !== "undefined" ? window.innerWidth - MARGIN * 2 : PICKER_WIDTH)}
            height={Math.min(PICKER_HEIGHT, typeof window !== "undefined" ? window.innerHeight - MARGIN * 2 : PICKER_HEIGHT)}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
