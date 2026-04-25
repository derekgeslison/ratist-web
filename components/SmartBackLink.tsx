"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPreviousNavEntry, inferTitleForPath, type NavEntry } from "@/lib/nav-history";

interface Props {
  /** Where to go and what to show when the breadcrumb has nothing —
   *  user landed here directly with no in-app history and an unknown
   *  referrer. Typically the parent listing page ("/movies", "All movies"). */
  defaultHref: string;
  defaultLabel: string;
  className?: string;
}

interface Resolved {
  href: string;
  label: string;
}

/**
 * Renders an "← Back to X" link where X reflects where the user
 * actually came from. Resolution order:
 *
 *   1. sessionStorage breadcrumb — most recent entry whose path differs
 *      from this page. Carries the page's dynamic title (movie title,
 *      person name, etc.) registered by NavEntryRegister.
 *
 *   2. document.referrer — if same-origin and we recognize the path
 *      (inferTitleForPath), use that label. Covers the new-tab case
 *      where sessionStorage is empty but the referrer is meaningful.
 *
 *   3. defaultHref / defaultLabel — direct entry, unknown referrer.
 *
 * Initial render uses the defaults (we can't read sessionStorage during
 * SSR, and it'd cause a hydration mismatch otherwise). The effect
 * resolves the smarter target after mount.
 *
 * Navigation is intentionally a plain Link — no router.back() trickery.
 * Earlier revisions tried to preserve forward stack + scroll position
 * via router.back() when the breadcrumb said "you just came from
 * there", but window.history.length is unreliable (it counts about:
 * blank fresh-tab entries) so the back() call sometimes no-op'd and
 * the click did nothing. Plain href navigation is the bulletproof
 * default; the small loss of scroll preservation is worth the
 * predictable behavior.
 */
export default function SmartBackLink({ defaultHref, defaultLabel, className }: Props) {
  const pathname = usePathname();
  const [resolved, setResolved] = useState<Resolved>({
    href: defaultHref,
    label: defaultLabel,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    const prev: NavEntry | null = getPreviousNavEntry(pathname);
    if (prev) {
      setResolved({ href: prev.fullPath, label: `Back to ${prev.title}` });
      return;
    }

    // No in-app breadcrumb — try the document.referrer as a fallback.
    // Same-origin only, and only when we can produce a friendly label
    // for the path. Otherwise we'd render unhelpful URL fragments.
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      const sameOrigin = ref && ref.origin === window.location.origin;
      if (sameOrigin && ref) {
        const inferred = inferTitleForPath(ref.pathname);
        if (inferred && ref.pathname !== pathname) {
          setResolved({
            href: ref.pathname + ref.search,
            label: `Back to ${inferred}`,
          });
          return;
        }
      }
    } catch { /* malformed referrer URL — fall through to default */ }

    setResolved({ href: defaultHref, label: defaultLabel });
  }, [pathname, defaultHref, defaultLabel]);

  return (
    <Link
      href={resolved.href}
      className={className ?? "inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"}
    >
      <ArrowLeft className="w-4 h-4" />
      {resolved.label}
    </Link>
  );
}
