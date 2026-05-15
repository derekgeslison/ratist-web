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
  // Permanent (308) redirects for stale Laravel-era URLs Google still
  // has in its index. Each one was reported by GSC as a 404 / noindex
  // hit; this lets crawl equity transfer to the current page rather
  // than getting silently dropped.
  async redirects() {
    return [
      // subscribe.theratist.com is the bypass subdomain the native
      // apps (iOS + Android) open in the system browser. It's NOT in
      // either app's app-link manifest, so the OS opens it externally
      // instead of routing back into the WebView. Any path on that
      // host redirects to /backstage-pass?from=app on the canonical
      // domain — the user is now in Safari/Chrome on www.theratist.com
      // and can complete checkout normally. The 308 preserves the
      // request method; the explicit query param survives because
      // the destination is a full URL, not a pattern.
      {
        source: "/:path*",
        has: [{ type: "host", value: "subscribe.theratist.com" }],
        destination: "https://www.theratist.com/backstage-pass?from=app",
        permanent: true,
      },
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
