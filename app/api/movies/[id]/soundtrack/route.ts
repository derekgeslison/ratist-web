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

    // Find the best release — prefer consumer soundtracks over expanded scores
    const titleLower = title.toLowerCase();
    const candidates = searchData.releases
      .filter((r) => {
        const rTitle = r.title.toLowerCase();
        return rTitle.includes(titleLower) || titleLower.includes(rTitle.replace(/\s*\(.*\)/, "").trim());
      })
      .map((r) => {
        const rTitle = r.title.toLowerCase();
        const count = r["track-count"] ?? 0;
        let score = 0;

        // Prefer releases with "soundtrack" or "music from" in title
        if (rTitle.includes("soundtrack") || rTitle.includes("music from")) score += 50;
        // Deprioritize releases with "score" in the title (these have cue sheets)
        if (rTitle.includes("original score") || rTitle.includes("film score")) score -= 30;
        // Deprioritize releases with "deluxe" or "complete" (often have alternate takes)
        if (rTitle.includes("complete") || rTitle.includes("expanded")) score -= 20;

        // Prefer a sweet spot of 8-45 tracks (typical consumer album)
        if (count >= 8 && count <= 45) score += 40;
        else if (count > 45) score -= (count - 45); // penalize massive releases
        else if (count < 8 && count > 0) score += 10;

        // Small bonus for having more tracks within the sweet spot
        if (count >= 8 && count <= 45) score += Math.min(count, 30);

        return { release: r, score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    const bestRelease = candidates[0].release;
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

    // Deduplicate by normalizing titles (strip version/part numbers)
    function normalizeTitle(t: string): string {
      return t
        .replace(/\s*\(Version \d+\)/gi, "")
        .replace(/\s*\(Part \d+\)/gi, "")
        .replace(/\s*\[.*?\]/g, "") // remove bracketed metadata like [1m3a]
        .replace(/\s*Version \d+/gi, "")
        .trim();
    }

    const seen = new Set<string>();
    const filtered = tracks.filter((t) => {
      // Remove very short tracks (likely transitions/cues)
      if (t.duration === "0:00" || t.duration === "0:01") return false;

      // Deduplicate by normalized title + artist
      const key = `${normalizeTitle(t.title).toLowerCase()}::${t.artist.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    }).map((t) => ({
      ...t,
      title: normalizeTitle(t.title), // clean up the display title too
    }));

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
