// Server-side reCAPTCHA v2 (checkbox) token verification.
//
// Pattern: client renders the v2 checkbox widget on the signup form,
// user clicks it, grecaptcha.getResponse() returns a token. Token is
// POSTed to /api/auth/sync, which calls Google's siteverify endpoint
// with the secret key. v2's siteverify response carries a binary
// `success` boolean — no score, no threshold.
//
// Fail-open: if the env vars are absent (local dev, env not yet
// provisioned), this returns { ok: true } so signup keeps working.
// Once keys are set in prod the gate is active.
//
// Note: env vars are named *_V3_* for historical reasons but hold v2
// keys. Matches lib/recaptcha-client.ts.

import "server-only";

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface RecaptchaResult {
  ok: boolean;
  reason?: string;
}

export async function verifyRecaptchaToken(
  token: string | null | undefined,
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_V3_SECRET_KEY;
  if (!secret) {
    // No key configured — pass-through. Lets local dev + first-deploy
    // not break signup. Prod must set the env var for the gate to work.
    return { ok: true };
  }
  if (!token) {
    return { ok: false, reason: "Missing reCAPTCHA token" };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json() as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return { ok: false, reason: `reCAPTCHA verification failed: ${(data["error-codes"] ?? []).join(", ") || "unknown"}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("reCAPTCHA verify error:", err);
    // Don't block on Google API outage; let signup proceed. The
    // captcha gate is defense-in-depth, not the only anti-spam layer.
    return { ok: true };
  }
}
