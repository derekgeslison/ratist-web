import type { Metadata } from "next";
import OfflineRetry from "./OfflineRetry";

export const metadata: Metadata = {
  title: "Offline",
  description: "You appear to be offline. Reconnect to keep browsing The Ratist.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 text-7xl font-black tracking-tighter text-[var(--ratist-red)] leading-none">
          —
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          You&apos;re offline
        </h1>
        <p className="text-[var(--foreground-muted)] mb-8 leading-relaxed">
          The Ratist needs an internet connection to load fresh ratings, recommendations, and community activity.
        </p>
        <OfflineRetry />
        <p className="text-xs text-[var(--foreground-muted)] mt-8">
          Some previously-visited pages may still be available from your device&apos;s cache.
        </p>
      </div>
    </div>
  );
}
