// The Ratist — service worker
//
// Strategy:
//   • HTML navigations  → network-first, offline fallback to /offline
//   • /_next/static/*   → cache-first (immutable, fingerprinted)
//   • Other GET assets  → stale-while-revalidate
//   • /api/*            → network-only (never cache — auth + dynamic data)
//   • /__/*             → NOT INTERCEPTED (Firebase auth handlers — any
//                          touching breaks the OAuth popup→parent
//                          postMessage flow on mobile)
//   • /auth/*           → NOT INTERCEPTED (our sign-in pages)
//
// Bump CACHE_VERSION when changing this file's logic; old caches purge on
// the next activate.

const CACHE_VERSION = "v2";
const STATIC_CACHE = `ratist-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ratist-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

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
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
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
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503 });
  }
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
