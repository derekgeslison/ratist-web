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
  /** True when the title was inferred from the pathname rather than
   *  explicitly registered with a dynamic value (movie title, person
   *  name). Used to prevent the auto-registrar from overwriting a
   *  page's explicit registration with a generic inferred label. */
  inferred?: boolean;
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
export function pushNavEntry(entry: { path: string; fullPath: string; title: string; inferred?: boolean }): void {
  if (typeof window === "undefined") return;
  if (!entry.path || !entry.title) return;
  const list = readList();
  const last = list[list.length - 1];
  if (last && last.path === entry.path) {
    // Don't let an inferred title clobber an explicit one. The
    // auto-registrar runs on every page; pages that also register
    // explicitly (movies, shows, people, posts) deserve their richer
    // dynamic title. Without this guard, the auto-register effect
    // (which runs after the page's explicit register due to
    // child-to-parent useEffect ordering) would always overwrite.
    if (entry.inferred && last.title && !last.inferred) return;
    list[list.length - 1] = { ...last, title: entry.title, fullPath: entry.fullPath, inferred: entry.inferred, ts: Date.now() };
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
  const p = pathname.replace(/\/+$/, "") || "/";

  // Static labels — exact-match routes. Detail pages (/movies/[id],
  // /celebrities/[id], etc.) intentionally aren't here; they register
  // their dynamic title via NavEntryRegister.
  const STATIC: Record<string, string> = {
    "/": "Home",
    "/movies": "All movies",
    "/celebrities": "All celebrities",
    "/search": "Search",
    "/forum": "Forum",
    "/blog": "Blog",
    "/news": "News",
    "/two-thumbs": "Two Thumbs",
    "/movie-maps": "Movie Maps",
    "/tools": "Tools",
    "/tools/matchup": "The Matchup",
    "/tools/shared-cast": "Shared Cast & Crew",
    "/tools/actor-lookup": "Actor Lookup",
    "/tools/recommend": "Recommendations",
    "/tools/rankings": "Rankings",
    "/tools/oscar-predictor": "Oscar Predictor",
    "/tools/analytics": "Analytics",
    "/tools/collections": "Collections",
    "/community": "Community",
    "/community/recast": "Recasts",
    "/community/hot-takes": "Hot Takes",
    "/community/looks-like": "Looks Like",
    "/community/pitches": "Movie Pitches",
    "/community/cineq": "Cine-Q",
    "/community/movie-club": "Movie Club",
    "/community/oscar-picks": "Oscar Picks",
    "/watchlist": "Watchlists",
    "/seen": "Diary",
    "/ratings": "My Ratings",
    "/for-you": "For You",
    "/screening-room": "Screening Room",
    "/connections": "Connections",
    "/badges": "Badges",
    "/notifications": "Notifications",
    "/feedback": "Feedback",
    "/feedback/my": "My Feedback",
    "/settings": "Settings",
    "/about": "About",
    "/backstage-pass": "Backstage Pass",
  };
  if (STATIC[p]) return STATIC[p];

  // Pattern fallbacks. The auto-registrar uses these so even subroute
  // pages (e.g., /backstage-pass/critics-mode) get a sensible label.
  if (p.startsWith("/backstage-pass/")) return "Backstage Pass";
  if (p.startsWith("/tools/")) return "Tools";
  if (p.startsWith("/community/")) return "Community";
  // /profile/[id] and its sub-routes (badges, compare, rankings, …).
  // The /profile/[id] root page additionally registers an explicit
  // "{name}'s profile" title via NavEntryRegister, which overrides
  // this inferred label thanks to pushNavEntry's coalesce guard. The
  // generic "Profile" string only surfaces on sub-routes that don't
  // do their own explicit registration.
  if (p.startsWith("/profile/")) return "Profile";

  return null;
}
