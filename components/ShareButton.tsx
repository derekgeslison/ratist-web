"use client";

import { useState } from "react";
import { Share2, X, Copy, Check, Download, Image as ImageIcon } from "lucide-react";

interface Props {
  text: string;
  url: string;
  label?: string;
  /** URL to the OG/card image endpoint — enables image preview and download */
  cardImageUrl?: string;
}

export default function ShareButton({ text, url, label = "Share", cardImageUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fullText = `${text}\n\n${url}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);

  function handleCopyLink() {
    navigator.clipboard.writeText(url).then(() => {
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

  async function handleDownload() {
    if (!cardImageUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(cardImageUrl);
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
      window.open(cardImageUrl, "_blank");
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Share</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Card image preview */}
            {cardImageUrl && (
              <div className="mb-4">
                {showPreview ? (
                  <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cardImageUrl}
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
              {cardImageUrl && (
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
            {cardImageUrl && (
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
