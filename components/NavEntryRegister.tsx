"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pushNavEntry } from "@/lib/nav-history";

interface Props {
  /** User-facing label for this page — usually the dynamic title (movie
   *  title, show name, person name). The SmartBackLink that another
   *  page renders later reads this back as "Back to ..." text. */
  title: string;
}

/**
 * Client-side breadcrumb registrar. Drop this into any page that wants
 * its title remembered for back-link context. Pass the title — the
 * path comes from usePathname() at the time the effect runs.
 *
 * Read window.location.search directly inside the effect rather than
 * subscribing via useSearchParams(), because useSearchParams() forces
 * the host page to opt into Suspense and breaks static prerender on
 * client-component pages that aren't already wrapped (e.g., /forum).
 * The breadcrumb only needs the search string at mount time anyway —
 * subsequent same-path filter changes are conceptually still the
 * same "page" from the user's perspective.
 */
export default function NavEntryRegister({ title }: Props) {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !title || typeof window === "undefined") return;
    const fullPath = pathname + (window.location.search || "");
    pushNavEntry({ path: pathname, fullPath, title });
  }, [pathname, title]);
  return null;
}
