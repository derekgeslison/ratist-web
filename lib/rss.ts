import { XMLParser } from "fast-xml-parser";

export interface RssItem {
  title: string;
  url: string;
  description?: string;
  imageUrl?: string;
  pubDate?: string;
}

interface FeedSource {
  name: string;
  url: string;
}

export const RSS_FEEDS: FeedSource[] = [
  { name: "Deadline", url: "https://deadline.com/feed/" },
  { name: "Variety", url: "https://variety.com/feed/" },
  { name: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { name: "Collider", url: "https://collider.com/feed/" },
  { name: "Screen Rant", url: "https://screenrant.com/feed/" },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function extractImage(item: Record<string, unknown>): string | undefined {
  // Try media:content or media:thumbnail
  const media = item["media:content"] ?? item["media:thumbnail"];
  if (media) {
    const url = typeof media === "object" && media !== null
      ? (media as Record<string, unknown>)["@_url"]
      : undefined;
    if (typeof url === "string") return url;
  }
  // Try enclosure
  const enc = item["enclosure"];
  if (enc && typeof enc === "object" && enc !== null) {
    const url = (enc as Record<string, unknown>)["@_url"];
    if (typeof url === "string" && /image/i.test(String((enc as Record<string, unknown>)["@_type"] ?? ""))) return url;
  }
  // Try og:image in description (crude but common)
  const desc = String(item["description"] ?? "");
  const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return imgMatch[1];
  return undefined;
}

export async function fetchFeed(source: FeedSource): Promise<RssItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "TheRatist/1.0 (https://www.theratist.com)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const parsed = parser.parse(xml);

    // Handle RSS 2.0 and Atom feeds
    const channel = parsed?.rss?.channel ?? parsed?.feed;
    if (!channel) return [];

    const rawItems: Record<string, unknown>[] = channel.item ?? channel.entry ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items.slice(0, 20).map((item) => ({
      title: String(item.title ?? "").replace(/<[^>]*>/g, "").trim(),
      url: String(item.link ?? item.guid ?? "").trim(),
      description: String(item.description ?? item.summary ?? "")
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, 300) || undefined,
      imageUrl: extractImage(item),
      pubDate: String(item.pubDate ?? item.published ?? item.updated ?? ""),
    })).filter((item) => item.title && item.url);
  } catch {
    return [];
  }
}

export async function fetchAllFeeds(): Promise<(RssItem & { feedSource: string })[]> {
  const results = await Promise.all(
    RSS_FEEDS.map(async (source) => {
      const items = await fetchFeed(source);
      return items.map((item) => ({ ...item, feedSource: source.name }));
    })
  );
  return results.flat();
}
