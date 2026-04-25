"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  /** True when the resolved target came from sessionStorage (i.e. the
   *  user genuinely was just there). When true, clicking the link
   *  prefers router.back() so the browser's forward stack and scroll
   *  position are preserved; when false (referrer or default), we
   *  push a fresh navigation. */
  fromHistory: boolean;
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
 */
export default function SmartBackLink({ defaultHref, defaultLabel, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [resolved, setResolved] = useState<Resolved>({
    href: defaultHref,
    label: defaultLabel,
    fromHistory: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    const prev: NavEntry | null = getPreviousNavEntry(pathname);
    if (prev) {
      setResolved({ href: prev.fullPath, label: `Back to ${prev.title}`, fromHistory: true });
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
            fromHistory: false,
          });
          return;
        }
      }
    } catch { /* malformed referrer URL — fall through to default */ }

    setResolved({ href: defaultHref, label: defaultLabel, fromHistory: false });
  }, [pathname, defaultHref, defaultLabel]);

  const onClick = (e: React.MouseEvent) => {
    // History-backed targets: use router.back() so the forward stack
    // and the destination's scroll position survive. We only do this
    // when the breadcrumb says we just came from there — modifier
    // clicks (cmd/ctrl/middle) get the regular Link behavior so users
    // can open in a new tab.
    if (!resolved.fromHistory) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (window.history.length > 1) router.back();
    else router.push(resolved.href);
  };

  return (
    <Link
      href={resolved.href}
      onClick={onClick}
      className={className ?? "inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"}
    >
      <ArrowLeft className="w-4 h-4" />
      {resolved.label}
    </Link>
  );
}
