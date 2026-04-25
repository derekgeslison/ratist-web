/**
 * Per-tab navigation breadcrumb stored in sessionStorage. Detail pages
 * (movies, shows, celebrities, etc.) push their pathname + a friendly
 * dynamic title on mount; the SmartBackLink component reads the most
 * recent OTHER entry to render context-aware "Back to ..." links.
 *
 * Why sessionStorage instead of a React context: the breadcrumb needs
 * to survive client-side navigation (next/router replaces the React
 * tree on each route change), and we want it to outlive a hard refresh.
 * sessionStorage is per-tab, which is exactly the right scope — opening
 * a link in a new tab gets a fresh breadcrumb (and a document.referrer
 * fallback inside SmartBackLink covers that case).
 */

const STORAGE_KEY = "ratist:nav-history";
const MAX_ENTRIES = 20;

export interface NavEntry {
  /** Pathname only — used for dedup ("am I already at /movies/123?"). */
  path: string;
  /** Full pathname + querystring — what the back link navigates to. */
  fullPath: string;
  /** User-facing label, e.g., "Inception" or "All celebrities". */
  title: string;
  /** Push timestamp. Mostly diagnostic; not used by readers. */
  ts: number;
}

function readList(): NavEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(list: NavEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* storage full or disabled — fine, breadcrumb degrades to default labels */ }
}

/**
 * Push the current page onto the breadcrumb. Consecutive same-path
 * pushes (a refresh, or a query-string update like switching seasons in
 * the Watch Companion) are coalesced into a single entry — we update
 * the existing title + fullPath rather than stacking duplicates, so the
 * "Back" target doesn't unintentionally point at our own previous query
 * state.
 */
export function pushNavEntry(entry: { path: string; fullPath: string; title: string }): void {
  if (typeof window === "undefined") return;
  if (!entry.path || !entry.title) return;
  const list = readList();
  const last = list[list.length - 1];
  if (last && last.path === entry.path) {
    list[list.length - 1] = { ...last, title: entry.title, fullPath: entry.fullPath, ts: Date.now() };
  } else {
    list.push({ ...entry, ts: Date.now() });
  }
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  writeList(list);
}

/**
 * Find the most recent breadcrumb entry whose path differs from the
 * current path. Walks backward so a refresh on a detail page still
 * finds the page-before-it as "previous", not itself.
 */
export function getPreviousNavEntry(currentPath: string): NavEntry | null {
  const list = readList();
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].path !== currentPath) return list[i];
  }
  return null;
}

/**
 * Friendly labels for known list / static routes. Used as a fallback
 * label when the user lands on a detail page from a referrer we can
 * recognize but didn't get a chance to register a breadcrumb entry
 * for (e.g., opened the page in a new tab and document.referrer is
 * the only signal we have). Returns null for unrecognized paths so
 * callers can decide between a generic "Back" or a route-specific
 * default.
 */
export function inferTitleForPath(pathname: string): string | null {
  if (!pathname) return null;
  // Strip trailing slash for matching.
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return "Home";
  if (p === "/movies") return "All movies";
  if (p === "/celebrities") return "All celebrities";
  if (p === "/search") return "Search";
  if (p === "/forum") return "Forum";
  if (p === "/blog") return "Blog";
  if (p === "/news") return "News";
  if (p === "/two-thumbs") return "Two Thumbs";
  if (p === "/movie-maps") return "Movie Maps";
  return null;
}
