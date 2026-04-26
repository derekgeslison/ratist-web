"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  /** Source URL or object URL of the image to crop. */
  src: string;
  /** Output square size in pixels (default 512 — generous enough for
   *  a Retina avatar and small enough to keep upload payloads sane). */
  outputSize?: number;
  /** Called with the cropped JPEG Blob when the user confirms. */
  onConfirm: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
}

const VIEWPORT = 280; // CSS px — visual square the user is fitting into

/**
 * Square avatar cropping modal. The user drags to pan and uses a
 * zoom slider; on confirm we draw the visible portion of the image
 * to a canvas and emit a JPEG Blob at output size. Built without
 * external libraries to avoid adding a dep for one feature.
 */
export default function AvatarCropModal({ src, outputSize = 512, onConfirm, onCancel }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const imgRef = useRef<HTMLImageElement>(new Image());
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  // Scale: multiplier on top of the "cover" base scale (the smallest
  // scale at which the image fully covers the square viewport). Min
  // 1 so the user can never zoom OUT past the viewport edges (would
  // create empty space in the avatar).
  const [scale, setScale] = useState(1);
  // Offset in CSS pixels of the image's top-left corner relative to
  // the viewport's top-left.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
    };
    img.crossOrigin = "anonymous";
    img.src = src;
  }, [src]);

  // Compute the base "cover" scale once the image is loaded — the
  // factor that makes the image's smaller side equal the viewport.
  // Centering offset is half the overflow of the larger side.
  const baseScale = imgSize ? VIEWPORT / Math.min(imgSize.w, imgSize.h) : 1;
  const renderedW = imgSize ? imgSize.w * baseScale * scale : 0;
  const renderedH = imgSize ? imgSize.h * baseScale * scale : 0;

  // Center the image when first loaded.
  useEffect(() => {
    if (!imgSize) return;
    setOffset({
      x: (VIEWPORT - imgSize.w * baseScale) / 2,
      y: (VIEWPORT - imgSize.h * baseScale) / 2,
    });
  }, [imgSize, baseScale]);

  // Clamp offset so the image always covers the viewport — no empty
  // edges visible after pan/zoom.
  function clampOffset(x: number, y: number) {
    const minX = VIEWPORT - renderedW;
    const minY = VIEWPORT - renderedH;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy));
  }
  function onPointerUp(e: React.PointerEvent) {
    dragStartRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onScaleChange(next: number) {
    if (!imgSize) return;
    // Re-clamp after scale change because the new rendered size may
    // make the current offset invalid.
    const newRenderedW = imgSize.w * baseScale * next;
    const newRenderedH = imgSize.h * baseScale * next;
    const minX = VIEWPORT - newRenderedW;
    const minY = VIEWPORT - newRenderedH;
    setScale(next);
    setOffset({
      x: Math.min(0, Math.max(minX, offset.x)),
      y: Math.min(0, Math.max(minY, offset.y)),
    });
  }

  async function handleConfirm() {
    if (!imgSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Translate user-frame (CSS pixels relative to viewport) into
    // image-frame (natural image pixels). The portion of the image
    // that's visible in the viewport is what we draw to canvas.
    const effectiveScale = baseScale * scale;
    const sourceX = -offset.x / effectiveScale;
    const sourceY = -offset.y / effectiveScale;
    const sourceSize = VIEWPORT / effectiveScale;
    ctx.drawImage(
      imgRef.current,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, outputSize, outputSize
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const previewUrl = URL.createObjectURL(blob);
      onConfirm(blob, previewUrl);
    }, "image/jpeg", 0.92);
  }

  if (!mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Crop your photo</h3>
          <button
            onClick={onCancel}
            className="text-[var(--foreground-muted)] hover:text-white transition-colors"
            aria-label="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Square viewport with circular mask cue */}
        <div
          className="relative mx-auto bg-[var(--surface-2)] rounded-lg overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgLoaded && imgSize && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: imgSize.w * baseScale * scale,
                height: imgSize.h * baseScale * scale,
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {/* Circular mask outline so users can see the avatar
              shape they're cropping into — image is technically
              square but profile pictures display as circles. */}
          <div className="pointer-events-none absolute inset-0 rounded-lg">
            <div
              className="absolute inset-0 rounded-full border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-full accent-[var(--ratist-red)]"
          />
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={!imgLoaded}
            className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            Use this photo
          </button>
          <button
            onClick={onCancel}
            className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
