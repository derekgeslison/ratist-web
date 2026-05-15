import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Per-image `unoptimized` prop still works (set on avatars, Giphy
    // GIFs, theme header images, etc. — anywhere we want to skip
    // Vercel's optimizer). Removing the global flag lets TMDB
    // posters / backdrops auto-convert to WebP/AVIF, generate
    // responsive variants, and benefit from Next's lazy-load tuning.
    // This is the biggest single bandwidth lever on the site —
    // launch traffic likely stays in the Vercel free tier for
    // transforms; we'll monitor and re-evaluate post-launch.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        // GIPHY's media CDN — covers media.giphy.com plus the
        // numbered variants (media0–4.giphy.com, etc.).
        protocol: "https",
        hostname: "*.giphy.com",
      },
    ],
  },
  // subscribe.theratist.com is the bypass subdomain the native apps
  // (iOS + Android) open in the system browser. The subdomain is NOT
  // in either app's app-link manifest (Universal Links / App Links),
  // so the OS opens these URLs externally instead of routing them
  // back into the WebView.
  //
  // The OLD behavior was a 308 redirect from subscribe.theratist.com/*
  // → www.theratist.com/backstage-pass?from=app. That broke the bypass
  // entirely: the external browser hit the 308 immediately, navigated
  // to www.theratist.com (which IS in the app-link manifest), and the
  // OS recaptured the URL straight back into the app — leaving the
  // user looking at the same "Subscribe on web" button forever.
  //
  // The fix is a server-side rewrite (NOT a redirect). The user's
  // browser URL stays on subscribe.theratist.com (outside the deep-
  // link host), so the OS doesn't recapture; internally we serve the
  // /backstage-pass route with ?from=app so the page knows to render
  // the post-Stripe "Return to The Ratist app" CTA.
  //
  // Stripe's success_url / cancel_url still point at
  // www.theratist.com/backstage-pass, intentionally — once checkout
  // completes the user SHOULD get bounced back into the native app
  // by the deep-link handler.
  async rewrites() {
    // beforeFiles — runs BEFORE Next.js checks the filesystem for a
    // matching page. The default rewrite array (afterFiles) runs after
    // filesystem matching, which means `/` would resolve to
    // app/page.tsx (the home page) before this rewrite ever fired,
    // making the subdomain show the home page instead of the
    // backstage-pass content. beforeFiles takes priority over the
    // page route at /.
    return {
      beforeFiles: [
        // Root of the subscribe subdomain → /backstage-pass with the
        // from=app marker. Only matches "/" so /api/* (Stripe checkout
        // creation), /_next/* (page assets), and the canonical
        // /backstage-pass route itself all continue to resolve as
        // normal on this host.
        {
          source: "/",
          has: [{ type: "host", value: "subscribe.theratist.com" }],
          destination: "/backstage-pass?from=app",
        },
      ],
    };
  },
  // Permanent (308) redirects for stale Laravel-era URLs Google still
  // has in its index. Each one was reported by GSC as a 404 / noindex
  // hit; this lets crawl equity transfer to the current page rather
  // than getting silently dropped.
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/blogs", destination: "/posts?type=BLOG", permanent: true },
      // Listing-page consolidation — /blog, /movie-maps, /two-thumbs
      // collapse onto the unified /posts surface with the appropriate
      // type filter. Detail-page slug routes (/blog/[slug] etc.) stay
      // canonical and are NOT redirected here.
      { source: "/blog", destination: "/posts?type=BLOG", permanent: true },
      { source: "/movie-maps", destination: "/posts?type=MOVIE_MAP", permanent: true },
      { source: "/two-thumbs", destination: "/posts?type=PUNCH_AND_JUDY", permanent: true },
      // Film diary was renamed to "Seen" — the canonical surface lives
      // at /seen now.
      { source: "/diary", destination: "/seen", permanent: true },
      // Bare-path shortcuts to /tools/* features. Users sometimes type
      // the feature name without the /tools prefix.
      { source: "/recommend", destination: "/tools/recommend", permanent: true },
      { source: "/actor-lookup", destination: "/tools/actor-lookup", permanent: true },
      { source: "/matchup", destination: "/tools/matchup", permanent: true },
      { source: "/shared-cast", destination: "/tools/shared-cast", permanent: true },
      { source: "/analytics", destination: "/tools/analytics", permanent: true },
      { source: "/oscar-predictor", destination: "/tools/oscar-predictor", permanent: true },
      { source: "/rankings", destination: "/tools/rankings", permanent: true },
      // Bare-path shortcuts to /community/* features.
      { source: "/cineq", destination: "/community/cineq", permanent: true },
      { source: "/hot-takes", destination: "/community/hot-takes", permanent: true },
      { source: "/looks-like", destination: "/community/looks-like", permanent: true },
      { source: "/movie-club", destination: "/community/movie-club", permanent: true },
      { source: "/pitches", destination: "/community/pitches", permanent: true },
      { source: "/recast", destination: "/community/recast", permanent: true },
      { source: "/oscar-picks", destination: "/community/oscar-picks", permanent: true },
      // Plural→singular slip — users type /forums; canonical is /forum.
      { source: "/forums", destination: "/forum", permanent: true },
      { source: "/forums/:path*", destination: "/forum/:path*", permanent: true },
      // Hyphenated variant some old links / typed-from-memory URLs use.
      // Canonical is /auth/signin (single word). Dev log confirmed 404 hits.
      { source: "/auth/sign-in", destination: "/auth/signin", permanent: true },
      // Bare /auth had occasional 404 hits in dev log — send to signin.
      { source: "/auth", destination: "/auth/signin", permanent: true },
    ];
  },
};

export default nextConfig;
