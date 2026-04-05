import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "TheRatist/1.0 (https://theratist.com)";

interface MBRelease {
  id: string;
  title: string;
  date?: string;
  "track-count"?: number;
  "release-group"?: { "primary-type"?: string; "secondary-types"?: string[] };
}

interface MBTrack {
  position: number;
  title: string;
  length: number | null;
  recording: {
    title: string;
    length: number | null;
    "artist-credit"?: { name: string; artist: { name: string } }[];
  };
}

interface MBMedia {
  position: number;
  title: string;
  tracks: MBTrack[];
}

async function mbFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 }, // cache 24h
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Wait to respect rate limit
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const mediaType = req.nextUrl.searchParams.get("type") ?? "movie"; // "movie" | "tv"

  if (!title) return NextResponse.json({ tracks: [] });

  try {
    // Search for soundtrack releases matching the title
    const query = encodeURIComponent(`"${title}" AND type:soundtrack`);
    const searchData = await mbFetch<{ releases: MBRelease[] }>(
      `/release?query=${query}&fmt=json&limit=10`
    );

    if (!searchData?.releases?.length) {
      return NextResponse.json({ tracks: [] });
    }

    // Find the best release — prefer highest track count, prefer ones with matching title
    const titleLower = title.toLowerCase();
    const candidates = searchData.releases
      .filter((r) => {
        const rTitle = r.title.toLowerCase();
        // Must contain the search title or be a close match
        return rTitle.includes(titleLower) || titleLower.includes(rTitle.replace(/\s*\(.*\)/, "").trim());
      })
      .sort((a, b) => (b["track-count"] ?? 0) - (a["track-count"] ?? 0));

    if (candidates.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    // Get the best release's track listing
    const bestRelease = candidates[0];
    await delay(1100); // MusicBrainz rate limit: 1 req/sec

    const releaseData = await mbFetch<{ media: MBMedia[]; title: string; date?: string }>(
      `/release/${bestRelease.id}?inc=recordings+artist-credits&fmt=json`
    );

    if (!releaseData?.media?.length) {
      return NextResponse.json({ tracks: [] });
    }

    // Extract tracks with artist info
    const tracks = releaseData.media.flatMap((media) =>
      media.tracks.map((t) => {
        const artists = t.recording["artist-credit"]
          ?.map((ac) => ac.name || ac.artist.name)
          .join(", ") ?? "Unknown Artist";

        const durationMs = t.recording.length ?? t.length;
        const durationStr = durationMs
          ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, "0")}`
          : null;

        return {
          position: t.position,
          title: t.recording.title || t.title,
          artist: artists,
          duration: durationStr,
          disc: releaseData.media.length > 1 ? media.position : undefined,
          discTitle: releaseData.media.length > 1 ? media.title || undefined : undefined,
        };
      })
    );

    // Filter out dialogue/interlude tracks (common in movie soundtracks)
    const filtered = tracks.filter((t) => {
      const lower = t.title.toLowerCase();
      // Keep everything unless it's clearly a dialogue clip
      if (t.duration === "0:00" || t.duration === "0:01") return false;
      return true;
    });

    return NextResponse.json({
      tracks: filtered,
      albumTitle: releaseData.title,
      releaseDate: releaseData.date ?? null,
      source: "MusicBrainz",
    });
  } catch (err) {
    console.error("Soundtrack error:", err);
    return NextResponse.json({ tracks: [] });
  }
}
