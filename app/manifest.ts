import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "The Ratist",
    short_name: "Ratist",
    description:
      "Movie & TV ratings, recommendations, and community for cinephiles. Rate films across detailed criteria, get personalized picks from your unique taste profile.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f0f",
    theme_color: "#cc1034",
    lang: "en-US",
    dir: "ltr",
    categories: ["entertainment", "social", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "For You",
        short_name: "For You",
        description: "Personalized picks based on your taste",
        url: "/for-you?source=pwa",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Watchlist",
        short_name: "Watchlist",
        description: "Movies and shows you want to watch",
        url: "/watchlist?source=pwa",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "What Should I Watch?",
        short_name: "Recommend",
        description: "AI-powered movie recommendations",
        url: "/tools/recommend?source=pwa",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Forum",
        short_name: "Forum",
        description: "Community discussions",
        url: "/forum?source=pwa",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
