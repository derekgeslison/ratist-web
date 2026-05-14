"use client";

import { useState } from "react";
import Image from "next/image";
import { ZoomIn } from "lucide-react";
import ImageLightbox from "./ImageLightbox";

interface Props {
  /** Source URL for the small (default) display. Already-sized at the
   *  call site (e.g., posterUrl(path, "w342")). */
  src: string;
  /** Source URL for the zoomed-in modal — usually the same image at a
   *  larger TMDB size like "original" or "w780". When omitted, the
   *  small src is reused. */
  zoomSrc?: string;
  alt: string;
  /** Tailwind sizes attribute for the small render. */
  sizes?: string;
  /** Object-fit class for the small render — "object-cover" for posters,
   *  "object-cover object-top" for headshots so the face stays in
   *  frame when cropped. */
  objectClassName?: string;
  priority?: boolean;
}

/**
 * Wraps a poster/headshot in a button that opens a fullscreen lightbox
 * showing the same image at a larger size. Mobile-first: tap-friendly,
 * no hover dependency. Click-to-open behavior here; the actual viewer
 * (with pinch-zoom + pan on touch, double-tap to 2× on desktop, ESC
 * close, backdrop close, scroll lock) lives in ImageLightbox so all
 * full-screen-image surfaces share one source of truth.
 */
export default function ZoomableImage({
  src,
  zoomSrc,
  alt,
  sizes,
  objectClassName = "object-cover",
  priority,
}: Props) {
  const [open, setOpen] = useState(false);
  const fullSrc = zoomSrc ?? src;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute inset-0 group cursor-zoom-in"
        aria-label={`View larger ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={objectClassName}
        />
        {/* Hover hint (desktop). On mobile the button is the affordance. */}
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-3.5 h-3.5 text-white" />
        </span>
      </button>
      {open && (
        <ImageLightbox src={fullSrc} alt={alt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
