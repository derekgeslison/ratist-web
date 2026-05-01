import Link from "next/link";
import { Lock } from "lucide-react";

// In-page paywall used by the locked "My Collections" top-tab and the
// locked community sub-tabs (Match, Theme, Following, Popular, New,
// Bookmarks). Single component so the copy + CTA stay consistent.
export default function CollectionsPaywallCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/5 rounded-xl p-6 text-center max-w-md mx-auto my-8">
      <Lock className="w-8 h-8 text-[var(--ratist-red)] mx-auto mb-3" />
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-[var(--foreground-muted)] mb-4">{body}</p>
      <Link
        href="/backstage-pass/collections"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-4 py-2 transition-colors"
      >
        Learn about Backstage Pass
      </Link>
    </div>
  );
}
