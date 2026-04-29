import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
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
      { source: "/home", destination: "/", permanent: true },
      { source: "/blogs", destination: "/blog", permanent: true },
      { source: "/contact", destination: "/feedback", permanent: true },
    ];
  },
};

export default nextConfig;
