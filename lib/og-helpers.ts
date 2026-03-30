import { readFileSync } from "fs";
import { join } from "path";

let _logoBase64: string | null = null;

export function getLogoBase64(): string {
  if (_logoBase64) return _logoBase64;
  try {
    const logoData = readFileSync(join(process.cwd(), "public", "logo.png"));
    _logoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;
    return _logoBase64;
  } catch {
    // Return a transparent 1x1 pixel as fallback
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUpGrkJggg==";
  }
}

export function scoreHex(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#eab308";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://theratist.com";
}
