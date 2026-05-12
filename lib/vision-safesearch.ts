import { getAdminApp } from "@/lib/firebase-admin";

/**
 * Google Cloud Vision SafeSearch wrapper. Auth piggy-backs on the
 * Firebase Admin service-account credentials (same pattern as the
 * profile-avatar and profile-header upload routes) — no separate
 * Vision API key needed. The service account just needs the
 * Cloud Vision API enabled on its GCP project.
 *
 * Endpoint: POST https://vision.googleapis.com/v1/images:annotate
 * Feature:  SAFE_SEARCH_DETECTION
 *
 * SafeSearch returns five likelihood fields. We weight `adult`
 * (covers nudity / sexual content) and treat `racy` more
 * conservatively since artistic / provocative posters routinely
 * score POSSIBLE there.
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export type Likelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

export interface SafeSearchVerdict {
  adult: Likelihood;
  spoof: Likelihood;
  medical: Likelihood;
  violence: Likelihood;
  racy: Likelihood;
}

const HIT: Likelihood[] = ["LIKELY", "VERY_LIKELY"];
const HIT_INCLUSIVE: Likelihood[] = ["POSSIBLE", "LIKELY", "VERY_LIKELY"];

/**
 * True when the poster crosses our explicit-content threshold.
 *
 * Tuning history: the initial pass blocked at adult >= LIKELY only.
 * That left ~7% of the NC-17 catalog unblocked despite visible
 * nudity — illustrated, partial, or low-contrast posters scored
 * adult: POSSIBLE and squeaked through. We now block at adult:
 * POSSIBLE+ AND racy: LIKELY+, accepting a higher false-positive
 * rate (counterbalanced by the per-movie admin unblock toggle on
 * the detail page).
 */
export function shouldBlockPoster(v: SafeSearchVerdict): boolean {
  if (HIT_INCLUSIVE.includes(v.adult)) return true;
  if (HIT.includes(v.racy)) return true;
  return false;
}

/**
 * Scan a single poster URL via Vision SafeSearch. Returns null when
 * the call fails — the caller should treat null as "skip, don't
 * update the row".
 */
export async function scanPosterSafeSearch(imageUrl: string): Promise<SafeSearchVerdict | null> {
  try {
    const credential = getAdminApp().options.credential;
    if (!credential) return null;
    const tokenResult = await credential.getAccessToken();
    const accessToken = tokenResult.access_token;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Force quota attribution to the same Firebase project the
        // service account belongs to. Without this header Google
        // routes the call to a different default project and returns
        // PERMISSION_DENIED ("Vision API not enabled") even when it
        // IS enabled on the real project.
        ...(process.env.FIREBASE_ADMIN_PROJECT_ID
          ? { "x-goog-user-project": process.env.FIREBASE_ADMIN_PROJECT_ID }
          : {}),
      },
      body: JSON.stringify({
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [{ type: "SAFE_SEARCH_DETECTION" }],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      responses?: Array<{ safeSearchAnnotation?: SafeSearchVerdict }>;
    };
    const verdict = data.responses?.[0]?.safeSearchAnnotation;
    if (!verdict) return null;
    return verdict;
  } catch {
    return null;
  }
}
