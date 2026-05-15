"use client";

import Link from "next/link";
import { X, Ticket, Check, Star, Mic } from "lucide-react";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  type: "live-review" | "critics-mode";
  standardReviewCount?: number;
}

export default function BackstagePassPopup({ isOpen, onClose, type, standardReviewCount = 0 }: Props) {
  const isNativeApp = useIsNativeApp();
  // Treat unresolved (null) as native so we never flash the web
  // purchase CTA in the iOS WebView before the hook resolves.
  const showNativeUi = isNativeApp !== false;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--foreground-muted)] hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/30 mb-3">
              <Ticket className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white">
              {type === "live-review" ? "Live Review & Critics Mode" : "Critics Mode & Live Review"}
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">Part of the Backstage Pass</p>
          </div>

          {/* Live Review section */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Mic className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold text-white">Live Review</h3>
            </div>
            <p className="text-sm text-[var(--foreground-muted)] mb-3">
              Record your thoughts in real-time as you watch a movie. Timestamp your reactions, capture standout moments, and build authentic reviews.
            </p>
            <div className="space-y-2">
              {["Timestamped notes while watching", "Integrates into your final review", "Available in Standard & Critic modes"].map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {t}
                </div>
              ))}
            </div>
          </div>

          {/* Critics Mode section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold text-white">Critics Mode</h3>
            </div>
            <p className="text-sm text-[var(--foreground-muted)] mb-3">
              Add per-field commentary to every rating category. Write category summaries. Earn the Critics badge on your reviews.
            </p>
            <div className="space-y-2">
              {["Per-field commentary on every score", "Category summary notes", "Critics badge on reviews", `Requires 250+ Ratist reviews (you have ${standardReviewCount})`].map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {t}
                </div>
              ))}
            </div>
          </div>

          {/* Placeholder for screenshot */}
          <div className="aspect-video rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center mb-6">
            <p className="text-sm text-[var(--foreground-muted)]">Screenshot placeholder</p>
          </div>

          {/* CTA — native opens system browser, web stays in-app. */}
          {showNativeUi ? (
            <div className="bg-[var(--surface-2)] border border-amber-400/30 rounded-xl p-4 text-center">
              <p className="text-sm text-white mb-3">Subscribe on the web</p>
              <button
                onClick={() => {
                  window.open("https://www.theratist.com/backstage-pass?from=ios", "_blank");
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors"
              >
                <Ticket className="w-4 h-4" /> Open theratist.com
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link href="/backstage-pass" onClick={onClose}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors">
                <Ticket className="w-4 h-4" /> Get the Backstage Pass
              </Link>
              <Link href="/backstage-pass/critics-mode" onClick={onClose}
                className="text-center text-xs text-[var(--foreground-muted)] hover:text-amber-400 transition-colors">
                Learn more about these features →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
