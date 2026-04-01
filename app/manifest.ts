import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Ratist",
    short_name: "Ratist",
    description: "Movie ratings, done right.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#ef3b36",
    icons: [
      {
        src: "/favicon.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "617x561",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
