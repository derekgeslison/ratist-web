import { headers, cookies } from "next/headers";

/**
 * Country codes (ISO 3166-1 alpha-2) that we treat as "needs strict
 * GDPR/ePrivacy gating" for cookie / analytics / advertising script
 * loading.
 *
 * Covers:
 *  - EU 27 member states (Austria → Sweden)
 *  - EEA non-EU (Iceland, Liechtenstein, Norway)
 *  - UK (post-Brexit; ICO still enforces UK-GDPR which mirrors EU GDPR)
 *  - Switzerland (revFADP — analogous obligations under their own law)
 *
 * Source list verified 2026-05-16 — when the EU adds a member or the
 * UK rejoins, update here.
 */
const STRICT_COUNTRIES = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA non-EU
  "IS", "LI", "NO",
  // UK + Switzerland
  "GB", "CH",
]);

/**
 * Returns true if the request is from a country with GDPR-style
 * consent-before-cookie obligations. Uses Vercel's geolocation header
 * `x-vercel-ip-country` (Pro plan+). Falls back to false in unknown
 * cases so US users (and any other non-EU) get the current default-
 * permissive flow — incorrectly defaulting EU on everyone would tank
 * non-EU analytics + ad revenue without legal upside.
 *
 * VPN users from EU spoofing to a non-EU exit are accepted as "non-EU"
 * here. That's the cost of geolocation-based detection — we accept it
 * because the alternative (defaults-EU-for-everyone) is materially
 * worse for revenue and not legally required outside EU jurisdictions.
 */
export async function isStrictConsentRegion(): Promise<boolean> {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  if (!country) return false;
  return STRICT_COUNTRIES.has(country.toUpperCase());
}

/**
 * Read the server-side consent cookie (mirror of the localStorage
 * value the ConsentBanner client component writes). Used by the root
 * layout to decide whether to render GA4 / AdSense scripts on first
 * paint for EU users.
 *
 * Cookie shape (set by ConsentBanner.commit()):
 *   ratist-consent-v1 = "a:1,d:0"   // analytics granted, ads denied
 *   ratist-consent-v1 = "a:1,d:1"   // both granted
 *   ratist-consent-v1 = "a:0,d:0"   // both denied
 *
 * Returns `{ known: false }` when no cookie exists (first visit or
 * cleared cookies). In strict-consent regions the layout uses this
 * to suppress GA4/AdSense scripts entirely.
 */
export async function readConsentCookie(): Promise<
  | { known: false }
  | { known: true; analytics: boolean; advertising: boolean }
> {
  const raw = (await cookies()).get("ratist-consent-v1")?.value;
  if (!raw) return { known: false };
  // Minimal parse — format is "a:<0|1>,d:<0|1>"
  const a = /a:1/.test(raw);
  const d = /d:1/.test(raw);
  return { known: true, analytics: a, advertising: d };
}
