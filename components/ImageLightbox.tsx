"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Fullscreen image viewer. Used for media-tab stills, profile photos,
 * and blog-post images (movie maps especially benefit from this).
 *
 * Pinch-zoom + pan implemented via touch events + CSS transforms
 * on the image — kept local to this component so the rest of the
 * site stays at its locked viewport. Tap-to-toggle 2× zoom is the
 * desktop / single-tap equivalent.
 *
 * Bounds: zoom factor [1, 4]. Below 1× snaps back to 1× and recenters.
 * Pan only engages while zoomed > 1×.
 */
export default function ImageLightbox({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Refs preserved across renders so handlers can compute deltas
  // without rebinding listeners every frame.
  const lastTouches = useRef<{ x: number; y: number }[] | null>(null);
  const startScale = useRef(1);
  const startTx = useRef(0);
  const startTy = useRef(0);
  const startDist = useRef(0);
  const startMid = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clampScale(s: number) {
    return Math.max(1, Math.min(4, s));
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      lastTouches.current = [a, b];
      startDist.current = dist(a, b);
      startScale.current = scale;
      startTx.current = tx;
      startTy.current = ty;
      startMid.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      lastTouches.current = [{ x: t.clientX, y: t.clientY }];
      startTx.current = tx;
      startTy.current = ty;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && startDist.current > 0) {
      e.preventDefault();
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const newDist = dist(a, b);
      const factor = newDist / startDist.current;
      const newScale = clampScale(startScale.current * factor);
      setScale(newScale);
      // Approximate pan based on midpoint movement so the gesture
      // feels anchored where the user's fingers are.
      if (startMid.current) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        setTx(startTx.current + (mid.x - startMid.current.x));
        setTy(startTy.current + (mid.y - startMid.current.y));
      }
    } else if (e.touches.length === 1 && scale > 1 && lastTouches.current?.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      const start = lastTouches.current[0];
      setTx(startTx.current + (t.clientX - start.x));
      setTy(startTy.current + (t.clientY - start.y));
    }
  }

  function onTouchEnd() {
    lastTouches.current = null;
    startDist.current = 0;
    // Snap back to 1× if user almost-released the pinch.
    if (scale < 1.05) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }

  // Desktop click / single-tap on the image toggles between 1× and 2×.
  // Doesn't trigger backdrop close.
  function toggleZoom(e: React.MouseEvent) {
    e.stopPropagation();
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        onClick={toggleZoom}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: lastTouches.current ? "none" : "transform 0.18s ease-out",
          cursor: scale === 1 ? "zoom-in" : "zoom-out",
        }}
        draggable={false}
      />
    </div>
  );
}
