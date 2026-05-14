"use client";

import { useEffect, useState } from "react";
import { Share2, X, Copy, Check, Download, Image as ImageIcon } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Share as CapShare } from "@capacitor/share";

interface Props {
  text: string;
  url: string;
  label?: string;
  /** URL to the OG/card image endpoint — enables image preview and download */
  cardImageUrl?: string;
  /** Query-param keys to forward from the live URL onto the share URL +
   *  card image URL. Lets per-season pages (Watch Companion) share the
   *  ?s=N the user is currently viewing without the parent component
   *  having to plumb season state through props. The card image URL
   *  uses the same value but under a different key — the OG endpoint
   *  expects `season=N` while the page URL uses `s=N`, so the mapping
   *  is also configurable per-key. */
  forwardParams?: Array<{ from: string; toShare?: string; toCardImage?: string }>;
}

export default function ShareButton({ text, url, label = "Share", cardImageUrl, forwardParams }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // The "live" URLs: prop URL plus any forwarded query params from the
  // current window.location. Initialized to the prop URL so SSR-rendered
  // markup is correct, then overwritten on mount with the live values.
  const [liveUrl, setLiveUrl] = useState(url);
  const [liveCardImageUrl, setLiveCardImageUrl] = useState(cardImageUrl);
  // Mobile detection — native app OR mobile-browser-with-Web-Share-API.
  // Drives whether the "More apps" escape hatch (system share sheet)
  // gets rendered. Desktop browsers don't get it: their navigator.share
  // is unreliable across vendors and a system share sheet there is
  // basically a dropdown chooser of the same X / FB / Copy options.
  const [hasNativeShare, setHasNativeShare] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isNative = Capacitor.isNativePlatform();
    const isMobileWeb =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      "ontouchstart" in window;
    setHasNativeShare(isNative || isMobileWeb);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!forwardParams || forwardParams.length === 0) {
      setLiveUrl(url);
      setLiveCardImageUrl(cardImageUrl);
      return;
    }
    try {
      const liveParams = new URLSearchParams(window.location.search);
      const shareUrl = new URL(url);
      const cardUrl = cardImageUrl ? new URL(cardImageUrl) : null;
      for (const p of forwardParams) {
        const v = liveParams.get(p.from);
        if (v === null) continue;
        shareUrl.searchParams.set(p.toShare ?? p.from, v);
        if (cardUrl) cardUrl.searchParams.set(p.toCardImage ?? p.from, v);
      }
      setLiveUrl(shareUrl.toString());
      setLiveCardImageUrl(cardUrl ? cardUrl.toString() : cardImageUrl);
    } catch {
      // Bad URL or missing search support — fall back to prop URLs.
      setLiveUrl(url);
      setLiveCardImageUrl(cardImageUrl);
    }
  }, [url, cardImageUrl, forwardParams, open]);

  const fullText = `${text}\n\n${liveUrl}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(liveUrl);

  function handleCopyLink() {
    navigator.clipboard.writeText(liveUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  function handleCopyText() {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  }

  async function handleNativeShare() {
    // Same routing as PageShare: prefer Capacitor's plugin when in
    // the native app, fall back to navigator.share on touch browsers.
    // We never reach this branch on non-touch desktop because the
    // button isn't rendered there.
    if (Capacitor.isNativePlatform()) {
      try {
        await CapShare.share({ title: text, text, url: liveUrl });
      } catch { /* user cancelled */ }
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url: liveUrl });
      } catch { /* user cancelled */ }
    }
  }

  async function handleDownload() {
    if (!liveCardImageUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(liveCardImageUrl);
      if (!res.ok) throw new Error(`Image generation failed (${res.status})`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("image")) throw new Error("Response is not an image");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "ratist-share-card.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(liveCardImageUrl, "_blank");
    }
    setDownloading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && (
        <div
          // Bottom padding combines the OS safe-area inset (iOS home
          // indicator, modern Android nav bar) with a constant so the
          // sheet never sits flush against the device's bottom edge or
          // gets covered by browser nav chrome. At sm+ the modal is
          // centered (items-center) so the same padding is harmless
          // there — keeps a single style rule simple.
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Share</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Card image preview */}
            {liveCardImageUrl && (
              <div className="mb-4">
                {showPreview ? (
                  <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={liveCardImageUrl}
                      alt="Share card preview"
                      className="w-full h-auto"
                      onError={() => setShowPreview(false)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPreview(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Preview share card
                  </button>
                )}
              </div>
            )}

            {/* Text preview with copy button */}
            <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 pr-12 mb-5">
              <p className="text-sm text-[var(--foreground-muted)] whitespace-pre-line">{fullText}</p>
              <button
                onClick={handleCopyText}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                title="Copy text & link"
              >
                {copiedText ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-[var(--foreground-muted)] hover:text-white" />
                )}
              </button>
            </div>

            {/* Native share — phone-only escape hatch. Shows above the
                explicit X/FB/Copy grid because users who want the OS
                drawer want it as the primary action, not buried at the
                end of the grid. Hidden on desktop (no `ontouchstart`
                + no Capacitor) — that experience already has the X /
                FB / Copy options as the right primary actions. */}
            {hasNativeShare && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mb-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-medium transition-colors"
              >
                <Share2 className="w-4 h-4" />
                More apps
              </button>
            )}

            {/* Share targets */}
            <div className={`grid ${cardImageUrl ? "grid-cols-4" : "grid-cols-3"} gap-3`}>
              {/* X / Twitter */}
              <a
                href={`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.264 5.633L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-[10px] text-[var(--foreground-muted)] group-hover:text-white transition-colors">X</span>
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-5 h-5 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span className="text-[10px] text-[var(--foreground-muted)] group-hover:text-white transition-colors">Facebook</span>
              </a>

              {/* Download card */}
              {liveCardImageUrl && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
                >
                  <Download className={`w-5 h-5 ${downloading ? "animate-pulse text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] group-hover:text-white"} transition-colors`} />
                  <span className="text-[10px] text-[var(--foreground-muted)] group-hover:text-white transition-colors">
                    {downloading ? "Saving..." : "Save image"}
                  </span>
                </button>
              )}

              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                {copiedLink ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Copy className="w-5 h-5 text-[var(--foreground-muted)] group-hover:text-white transition-colors" />
                )}
                <span className="text-[10px] text-[var(--foreground-muted)] group-hover:text-white transition-colors">
                  {copiedLink ? "Copied!" : "Copy link"}
                </span>
              </button>
            </div>

            {/* Tip */}
            {liveCardImageUrl && (
              <p className="text-xs text-[var(--foreground-muted)] text-center mt-4">
                Save the image and copy the text above to share on Instagram or anywhere.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
