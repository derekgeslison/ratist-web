"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Search, X } from "lucide-react";

interface GifItem {
  id: string;
  title: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

interface Props {
  onSelect: (gifUrl: string) => void;
  className?: string;
}

const POP_WIDTH = 320;
const POP_HEIGHT = 380;
const MARGIN = 8;

interface Pos { top: number; left: number }

export default function GifButton({ onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Debounce search → /api/giphy/search. Empty query falls through to
  // GIPHY trending so the grid isn't blank when the picker first opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        const res = await fetch(`/api/giphy/search?${params.toString()}`);
        if (!res.ok) throw new Error(`GIPHY (${res.status})`);
        const data = await res.json();
        if (!cancelled) setItems(data.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load GIFs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, open]);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(POP_WIDTH, vw - MARGIN * 2);
      const h = Math.min(POP_HEIGHT, vh - MARGIN * 2);

      let top = rect.top - h - MARGIN;
      if (top < MARGIN) top = rect.bottom + MARGIN;

      let left = rect.left;
      if (left + w > vw - MARGIN) left = vw - w - MARGIN;
      if (left < MARGIN) left = MARGIN;

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

  // Outside click + Escape close. Same pattern as EmojiButton.
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

  // Cap popover dims to the viewport so phones with very narrow widths
  // get a properly-fitting picker.
  const w = mounted ? Math.min(POP_WIDTH, window.innerWidth - MARGIN * 2) : POP_WIDTH;
  const h = mounted ? Math.min(POP_HEIGHT, window.innerHeight - MARGIN * 2) : POP_HEIGHT;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-1 rounded text-xs font-bold border border-[var(--foreground-muted)] text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:border-[var(--ratist-red)] transition-colors ${className ?? ""}`}
        title="Add a GIF"
        aria-label="Add a GIF"
      >
        GIF
      </button>
      {mounted && open && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: w, height: h, zIndex: 100 }}
          className="bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-2 p-2 border-b border-[var(--border)]">
            <div className="flex-1 flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search GIPHY…"
                autoFocus
                className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none min-w-0"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-[var(--foreground-muted)] hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white p-1" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading && <p className="text-xs text-[var(--foreground-muted)] text-center py-4">Loading…</p>}
            {error && <p className="text-xs text-red-400 text-center py-4">{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className="text-xs text-[var(--foreground-muted)] text-center py-4">No GIFs found.</p>
            )}
            {!loading && items.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => { onSelect(it.url); setOpen(false); }}
                    className="relative bg-[var(--surface)] rounded overflow-hidden hover:ring-2 hover:ring-[var(--ratist-red)] transition"
                    style={{ paddingTop: it.height && it.width ? `${(it.height / it.width) * 100}%` : "75%" }}
                    title={it.title}
                  >
                    <Image
                      src={it.preview}
                      alt={it.title}
                      fill
                      sizes="160px"
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[9px] text-[var(--foreground-muted)] text-center py-1 border-t border-[var(--border)]">
            Powered by GIPHY
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
