"use client";

import { useState } from "react";
import { Share2, X, Copy, Check } from "lucide-react";

interface Props {
  title: string;
  /** Override the URL to share. Defaults to current page URL. */
  url?: string;
}

export default function PageShare({ title, url }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
  const shareText = title;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleNativeShare() {
    // Only attempt native share if the API exists AND we're likely on mobile
    // (navigator.share exists on some desktop browsers too but behaves differently)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && "ontouchstart" in window) {
      try {
        await navigator.share({ title: shareText, url: shareUrl });
      } catch { /* user cancelled */ }
      return; // always return — don't also show the modal
    }
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleNativeShare}
        className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors rounded-lg hover:bg-[var(--surface-2)]"
        title="Share this page"
        aria-label="Share"
      >
        <Share2 className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Share</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--foreground-muted)] bg-[var(--surface)] rounded-lg px-3 py-2 mb-4 truncate">{shareUrl}</p>

            <div className="grid grid-cols-3 gap-3">
              <a
                href={`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.264 5.633L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-[10px] text-[var(--foreground-muted)]">X</span>
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-5 h-5 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span className="text-[10px] text-[var(--foreground-muted)]">Facebook</span>
              </a>
              <button
                onClick={handleCopy}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-[var(--foreground-muted)]" />}
                <span className="text-[10px] text-[var(--foreground-muted)]">{copied ? "Copied!" : "Copy link"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
