"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";

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
 * no hover dependency, dismisses on backdrop click or ESC. The small
 * render fills its parent (assumes a relatively-positioned wrapper, the
 * convention everywhere these are used today), so swapping a static
 * <Image> for <ZoomableImage> is a drop-in replacement at the call site.
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

  // Lock the body scroll while the lightbox is up + dismiss on Esc.
  // Without scroll-lock, swiping the lightbox on iOS scrolls the page
  // underneath, which feels broken when you re-close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Larger view of ${alt}`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Click on the image itself doesn't close — only the backdrop.
             Lets the user pinch-zoom or screenshot without dismissing. */}
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullSrc}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
