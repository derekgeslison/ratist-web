import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server proxy for GIPHY's search + trending endpoints. Keeps the API
// key out of the client bundle and lets us shape the response down to
// just the fields the picker UI needs (the original payload is huge —
// dozens of MP4/WebP/preview variants per GIF, ~2KB each).
//
// Empty / missing `q` falls through to /trending so the picker has
// content the moment it opens, before the user types anything.

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}
interface GiphyEntry {
  id: string;
  title?: string;
  images: {
    fixed_height: GiphyImage;
    fixed_height_small?: GiphyImage;
    preview_gif?: { url: string };
    original?: GiphyImage;
  };
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GIPHY isn't configured — server admin needs to set GIPHY_API_KEY." },
      { status: 500 },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = Math.max(0, Math.min(parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0, 4500));
  const limit = 24;
  const rating = "pg-13"; // keep things workplace-ish for movie-discussion comments

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(limit),
    offset: String(offset),
    rating,
    bundle: "messaging_non_clips",
  });
  if (q) params.set("q", q);

  const endpoint = q ? "search" : "trending";
  const url = `https://api.giphy.com/v1/gifs/${endpoint}?${params.toString()}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `GIPHY error (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    const entries: GiphyEntry[] = Array.isArray(data.data) ? data.data : [];
    // Keep only what the picker needs. fixed_height (~200px tall) is
    // GIPHY's recommended grid-friendly variant; we use it both as the
    // thumbnail and as the saved/embedded URL since most comments
    // display at similar widths.
    const items = entries.map((e) => ({
      id: e.id,
      title: e.title ?? "",
      url: e.images.fixed_height?.url ?? e.images.original?.url ?? "",
      preview: e.images.fixed_height_small?.url ?? e.images.preview_gif?.url ?? e.images.fixed_height?.url ?? "",
      width: Number(e.images.fixed_height?.width ?? 0),
      height: Number(e.images.fixed_height?.height ?? 0),
    })).filter((e) => e.url);

    return NextResponse.json({
      items,
      pagination: {
        offset,
        count: items.length,
        total_count: data.pagination?.total_count ?? items.length,
      },
    });
  } catch (err) {
    console.error("GIPHY proxy error:", err);
    return NextResponse.json({ error: "GIPHY request failed" }, { status: 502 });
  }
}
