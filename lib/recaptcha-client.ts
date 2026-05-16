// Client-side reCAPTCHA v2 (checkbox) helper. Lazy-loads the Google
// script on first use and exposes renderWidget + getResponse helpers.
//
// Pattern: signup form renders a <div id="..." /> placeholder, calls
// renderRecaptchaWidget() in a useEffect, then before submit calls
// getRecaptchaResponse() to grab the token. Token is POSTed to the
// server, which verifies via siteverify.
//
// Fail-open: if the site key env var isn't set, render is a no-op and
// getRecaptchaResponse returns null. The server's verifier matches.
//
// Note: the env vars are named *_V3_* for historical reasons (we'd
// originally proposed v3); they hold v2 keys. Don't rename without
// updating Vercel env config.

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => number;
      getResponse: (widgetId?: number) => string;
      reset: (widgetId?: number) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("not in browser"));
  if (window.grecaptcha?.render) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // grecaptcha.render isn't available immediately on script load —
      // wait for ready().
      const wait = () => {
        if (window.grecaptcha?.render) resolve();
        else setTimeout(wait, 50);
      };
      wait();
    };
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function isRecaptchaConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY;
}

export async function renderRecaptchaWidget(
  container: HTMLElement,
  theme: "light" | "dark" = "dark",
): Promise<number | null> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY;
  if (!siteKey) return null;
  try {
    await loadScript();
    if (container.childElementCount > 0) {
      // Already rendered into this element; bail to avoid duplicate widget.
      return null;
    }
    return window.grecaptcha!.render(container, { sitekey: siteKey, theme });
  } catch (err) {
    console.warn("reCAPTCHA render failed:", err);
    return null;
  }
}

export function getRecaptchaResponse(widgetId: number | null): string | null {
  if (typeof window === "undefined" || !window.grecaptcha) return null;
  try {
    const response = widgetId != null
      ? window.grecaptcha.getResponse(widgetId)
      : window.grecaptcha.getResponse();
    return response || null;
  } catch {
    return null;
  }
}

export function resetRecaptcha(widgetId: number | null): void {
  if (typeof window === "undefined" || !window.grecaptcha) return;
  try {
    if (widgetId != null) window.grecaptcha.reset(widgetId);
    else window.grecaptcha.reset();
  } catch {
    /* ignore */
  }
}
