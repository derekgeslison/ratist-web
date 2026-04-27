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
};

export default nextConfig;
