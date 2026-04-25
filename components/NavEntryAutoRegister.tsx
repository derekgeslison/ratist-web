"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pushNavEntry, inferTitleForPath } from "@/lib/nav-history";

/**
 * Layout-level breadcrumb auto-registrar. Pushes the current pathname
 * onto the navigation breadcrumb on every route change using a
 * pathname-inferred title.
 *
 * Why a layout-level component instead of per-page registration:
 * dozens of pages link to movies / celebrities (tools, community
 * features, profile pages, the home page, etc.). Without
 * registration, navigating from one of those pages into a movie
 * detail page would produce a stale "Back to ..." link pointing at
 * whatever movie the user looked at hours earlier. Auto-registering
 * at the layout level gives every page a breadcrumb entry without
 * each page needing a per-instance hook call.
 *
 * Pages that need a richer dynamic title (movie title, person name,
 * post title) still mount NavEntryRegister explicitly. Their effect
 * runs FIRST (child-to-parent useEffect ordering), so the page's
 * explicit non-inferred entry is in place before this auto-register
 * effect fires. pushNavEntry's coalesce logic then refuses to
 * downgrade an explicit title to an inferred one.
 */
export default function NavEntryAutoRegister() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;
    const title = inferTitleForPath(pathname);
    if (!title) return; // Unknown route — skip rather than push a useless entry.
    const fullPath = pathname + (window.location.search || "");
    pushNavEntry({ path: pathname, fullPath, title, inferred: true });
  }, [pathname]);
  return null;
}
