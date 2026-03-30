"use client";

import { useState } from "react";
import { Share2, X, Copy, Check } from "lucide-react";

interface Props {
  text: string;
  url: string;
  label?: string;
}

export default function ShareButton({ text, url, label = "Share" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullText = `${text}\n\n${url}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Share</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Text preview */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5 text-sm text-[var(--foreground-muted)] whitespace-pre-line">
              {fullText}
            </div>

            {/* Share targets */}
            <div className="grid grid-cols-3 gap-3">
              {/* X / Twitter */}
              <a
                href={`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.264 5.633L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-xs text-[var(--foreground-muted)] group-hover:text-white transition-colors">X / Twitter</span>
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                <svg className="w-6 h-6 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span className="text-xs text-[var(--foreground-muted)] group-hover:text-white transition-colors">Facebook</span>
              </a>

              {/* Copy link */}
              <button
                onClick={handleCopy}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors group"
              >
                {copied ? (
                  <Check className="w-6 h-6 text-green-400" />
                ) : (
                  <Copy className="w-6 h-6 text-[var(--foreground-muted)] group-hover:text-white transition-colors" />
                )}
                <span className="text-xs text-[var(--foreground-muted)] group-hover:text-white transition-colors">
                  {copied ? "Copied!" : "Copy link"}
                </span>
              </button>
            </div>

            {/* Instagram note */}
            <p className="text-xs text-[var(--foreground-muted)] text-center mt-4">
              For Instagram, copy the link and paste it in your story or bio.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
