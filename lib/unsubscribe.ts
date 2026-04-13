import crypto from "crypto";

const SECRET = process.env.RESEND_API_KEY ?? process.env.CRON_SECRET ?? "ratist-fallback-secret";

/** Generate an HMAC token for a user ID — used in unsubscribe links. */
export function generateUnsubToken(userId: string): string {
  return crypto.createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 32);
}

/** Verify that a token matches the expected value for a user ID. */
export function verifyUnsubToken(userId: string, token: string): boolean {
  const expected = generateUnsubToken(userId);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

/** Build the full unsubscribe URL for a given user. */
export function unsubscribeUrl(userId: string): string {
  const token = generateUnsubToken(userId);
  return `${SITE_URL}/unsubscribe?uid=${userId}&token=${token}`;
}
