// The Ratist — service worker
//
// Strategy:
//   • HTML navigations  → network-first; cache PUBLIC paths so offline
//                          users can re-open recently-viewed pages
//   • /_next/static/*   → cache-first (immutable, fingerprinted)
//   • Other GET assets  → stale-while-revalidate
//   • /api/*            → network-only (never cache — auth + dynamic data)
//   • /__/*             → NOT INTERCEPTED (Firebase auth handlers — any
//                          touching breaks the OAuth popup→parent
//                          postMessage flow on mobile)
//   • /auth/*           → NOT INTERCEPTED (our sign-in pages)
//
// HTML cache is ONLY populated for paths that don't depend on viewer
// identity (movie/show details, news, blog, posts, releases, box office,
// homepage). Anything that renders viewer-specific state (profile,
// settings, watchlist, seen, for-you, ratings, connections, admin) is
// excluded — otherwise a cached page could show user A's private state
// to user B (e.g. on a shared device after sign-out).
//
// Bump CACHE_VERSION when changing this file's logic; old caches purge on
// the next activate.

const CACHE_VERSION = "v4";

// Hard ceiling on how long the SW will wait for the network on an
// HTML navigation. Without this, a hung TCP/TLS handshake on a cold
// app launch (Capacitor WebView, network stack just woke up) leaves
// the SW awaiting a fetch that never resolves; the WebView paints
// nothing, the user sees the Capacitor backgroundColor as a black
// screen, and the only escape is force-closing the app. 8s is well
// above a normal slow load (~1-3s) and far below "I should kill
// this" patience.
const HTML_NAVIGATION_TIMEOUT_MS = 8000;
const STATIC_CACHE = `ratist-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ratist-runtime-${CACHE_VERSION}`;
const HTML_CACHE = `ratist-html-${CACHE_VERSION}`;
const HTML_CACHE_MAX_ENTRIES = 20;
const OFFLINE_URL = "/offline";

// Paths the HTML cache is allowed to populate. Match must be public-
// only — viewer-specific renders MUST NOT be added to this list.
function isPublicCacheablePath(pathname) {
  if (pathname === "/") return true;
  if (pathname === "/movies" || pathname === "/shows") return true;
  if (pathname === "/news" || pathname === "/blog" || pathname === "/two-thumbs") return true;
  if (pathname === "/releases" || pathname === "/box-office") return true;
  if (pathname === "/community") return true;
  // Detail pages (slugged or id'd) — all public:
  if (/^\/movies\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/shows\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/news\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/blog\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/two-thumbs\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/posts\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/box-office\//.test(pathname)) return true;
  return false;
}

const STATIC_ASSETS = [
  OFFLINE_URL,
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE && key !== HTML_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET. Mutations are pass-through.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only — never intercept cross-origin (TMDB, Firebase, etc.)
  if (url.origin !== self.location.origin) return;

  // API: always network. Caching auth-bound responses is a footgun.
  if (url.pathname.startsWith("/api/")) return;

  // Firebase Auth handlers live at /__/auth/* on the app's own origin.
  // Any SW interception breaks the popup → parent postMessage handshake
  // and produces "auth/popup-closed-by-user" on mobile. Hands-off.
  if (url.pathname.startsWith("/__/")) return;

  // Our own auth pages (sign-in, password reset, email verify) — leave
  // alone so the network is the source of truth during sign-in flows.
  if (url.pathname.startsWith("/auth/")) return;

  // Next.js immutable static bundles: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigations: network-first, fall back to cache, then offline page.
  if (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // Everything else (images, fonts, public assets): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirstHTML(request) {
  const url = new URL(request.url);
  const cacheable = isPublicCacheablePath(url.pathname);

  // Race the network against the HTML navigation timeout. A timed-out
  // fetch is abandoned via AbortController so the browser doesn't keep
  // holding the connection open in the background. The catch-all
  // fallback below treats timeout and offline identically — cached
  // page if any, then offline page.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTML_NAVIGATION_TIMEOUT_MS);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (cacheable && response.ok && response.status === 200) {
      // Clone before consuming — caches.put consumes the body stream.
      const copy = response.clone();
      caches.open(HTML_CACHE)
        .then((cache) => cache.put(request, copy))
        .then(() => trimHtmlCache())
        .catch(() => {});
    }
    return response;
  } catch {
    clearTimeout(timeoutId);
    // Offline or timed-out path. Try the per-URL cache first
    // (recently-visited public pages), then fall back to the static
    // offline page.
    if (cacheable) {
      const htmlCache = await caches.open(HTML_CACHE);
      const cached = await htmlCache.match(request);
      if (cached) return cached;
    }
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503 });
  }
}

// Cap the HTML cache so it doesn't grow unbounded. Oldest entries (by
// insertion order, which Cache API preserves via keys()) are evicted
// first. Runs after each new insert; cheap enough to not need debouncing.
async function trimHtmlCache() {
  const cache = await caches.open(HTML_CACHE);
  const keys = await cache.keys();
  if (keys.length <= HTML_CACHE_MAX_ENTRIES) return;
  const toDelete = keys.slice(0, keys.length - HTML_CACHE_MAX_ENTRIES);
  await Promise.all(toDelete.map((k) => cache.delete(k)));
}

// ─── Push notifications ───────────────────────────────────────────────────
// Phase 1: scaffold only. Phase 2 will wire VAPID + per-user FCM tokens.
// The shape we expect from the server's push payload:
//   { title, body, url, tag, icon, badge, data }

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "The Ratist", body: event.data.text() };
  }

  const title = payload.title || "The Ratist";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/", ...(payload.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab on the same origin if any.
      for (const client of allClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
