const API_KEY = process.env.GOOGLE_SAFE_BROWSING_KEY;
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

/**
 * Check URLs against Google Safe Browsing API.
 * Returns array of unsafe URLs found. Empty array = all safe.
 * Returns empty if API key not configured (fail-open).
 */
export async function checkUrlSafety(urls: string[]): Promise<string[]> {
  if (!API_KEY || urls.length === 0) return [];

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "theratist", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    });

    if (!res.ok) return []; // fail-open if API errors

    const data = await res.json();
    if (data.matches && Array.isArray(data.matches)) {
      return data.matches.map((m: { threat: { url: string } }) => m.threat.url);
    }

    return [];
  } catch {
    return []; // fail-open on network errors
  }
}

/**
 * Extract all URLs from text content.
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...text.matchAll(urlRegex)].map((m) => m[0]);
}
