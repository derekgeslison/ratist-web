import Anthropic from "@anthropic-ai/sdk";

/**
 * Centralized AI error sanitization. Each /api/.../ai/* endpoint
 * catches its errors then passes them through here to get a JSON
 * response body that's safe to return to the end user.
 *
 * Three goals:
 *   1. Never leak the underlying provider's error message — those
 *      include things like "credit balance is too low", rate limit
 *      windows, organization IDs, internal error codes. None of
 *      that helps a user; all of it tells them stuff we'd rather
 *      they not know about our internals.
 *   2. Always log the full error server-side so we (admin) can
 *      diagnose. Vercel logs / log drains pick this up.
 *   3. Map provider conditions to user-actionable language where we
 *      reasonably can: 401/403 → config issue, 429 → busy, 5xx →
 *      generic try-again, everything else → generic.
 *
 * Usage at the catch site:
 *
 *   } catch (err) {
 *     const { status, body } = sanitizeAiError(err, "recommend");
 *     return NextResponse.json(body, { status });
 *   }
 */
export interface SanitizedAiError {
  status: number;
  body: { error: string };
}

export function sanitizeAiError(err: unknown, feature: string): SanitizedAiError {
  // Full detail to server log, never to client.
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`AI[${feature}]:`, detail, err);

  // Anthropic auth — our API key wrong, expired, or revoked. The
  // user-facing copy doesn't say "Anthropic" or imply the provider.
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      status: 503,
      body: { error: "Smart features are temporarily unavailable. Please try again later." },
    };
  }

  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : 500;

    // 429: rate limit / capacity. Anthropic distinguishes by sub-code
    // but the user-facing message is the same either way.
    if (status === 429) {
      return {
        status: 429,
        body: { error: "Our smart features are busy right now. Please try again in a minute." },
      };
    }
    // 402 or quota / credit: surface as "temporarily unavailable" so
    // users don't think they did something wrong, and so we don't
    // advertise that we ran out of credit.
    if (status === 402) {
      return {
        status: 503,
        body: { error: "Smart features are temporarily unavailable. Please try again later." },
      };
    }
    // 400 bad request can come from prompt content issues. Generic.
    if (status >= 400 && status < 500) {
      return {
        status: 502,
        body: { error: "We couldn't understand that request. Try rephrasing it." },
      };
    }
    return {
      status: 503,
      body: { error: "Smart features are having trouble right now. Please try again." },
    };
  }

  // Anything else (network, JSON parse, our own bugs).
  return {
    status: 500,
    body: { error: "Something went wrong on our end. Please try again." },
  };
}
