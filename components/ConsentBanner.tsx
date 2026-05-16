"use client";

/**
 * Cookie consent banner. Drives Google Consent Mode v2 so AdSense and
 * GA4 respect the user's choice automatically. Also serves as the
 * CCPA "Your Privacy Choices" surface — rejecting Advertising opts the
 * user out of cross-context behavioral advertising / "sharing."
 *
 * Categories:
 *   - Necessary: auth, session, security. Always on, can't be toggled.
 *   - Analytics (analytics_storage): GA4 product analytics.
 *   - Advertising (ad_storage + ad_user_data + ad_personalization): AdSense.
 *
 * Persistence: localStorage key `ratist:consent-v1`. Bump the key when
 * categories change so users get re-prompted.
 *
 * Re-open: any element can fire `window.dispatchEvent(new Event(
 * "ratist:open-cookie-prefs"))` to bring the banner back up.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "ratist:consent-v1";
const COOKIE_KEY = "ratist-consent-v1";
const OPEN_EVENT = "ratist:open-cookie-prefs";

interface ConsentState {
  analytics: boolean;
  advertising: boolean;
  // Timestamp + version capture so a future category change can
  // invalidate stale consent without losing per-user history if needed.
  ts: number;
  v: 1;
}

function applyToGtag(state: ConsentState) {
  // gtag is registered by the pre-interactive default script in
  // app/layout.tsx — `update` calls are safe before GA4/AdSense scripts
  // finish loading because they're wired to the same dataLayer queue.
  type Gtag = (...args: unknown[]) => void;
  const w = window as unknown as { gtag?: Gtag };
  const g = w.gtag;
  if (typeof g !== "function") return;
  g("consent", "update", {
    analytics_storage: state.analytics ? "granted" : "denied",
    ad_storage: state.advertising ? "granted" : "denied",
    ad_user_data: state.advertising ? "granted" : "denied",
    ad_personalization: state.advertising ? "granted" : "denied",
  });
}

function readStored(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v === 1 && typeof parsed.analytics === "boolean" && typeof parsed.advertising === "boolean") {
      return parsed as ConsentState;
    }
  } catch {
    /* corrupt — re-prompt */
  }
  return null;
}

function writeStored(state: ConsentState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode etc. */ }
  // Mirror into a server-readable cookie so the root layout can decide
  // whether to render GA4 / AdSense scripts on the next request — needed
  // for strict-consent regions (EU/EEA/UK/CH) where we don't load Google
  // scripts at all until the user grants consent. Format keeps the
  // payload < 30 bytes so we stay well under cookie size limits.
  try {
    const value = `a:${state.analytics ? 1 : 0},d:${state.advertising ? 1 : 0}`;
    const oneYear = 365 * 24 * 60 * 60;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${oneYear}; SameSite=Lax${secure}`;
  } catch { /* cookies disabled — site degrades gracefully to "no consent" */ }
}

function hasGPC(): boolean {
  if (typeof navigator === "undefined") return false;
  // Both the standardized prop and the older vendor-prefixed one.
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [advertising, setAdvertising] = useState(true);

  // Mount: decide whether to show the banner. If consent exists, apply
  // it; if not, honor GPC as a default-deny on advertising and show the
  // banner anyway so the user can confirm or expand.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      applyToGtag(stored);
      // Honor GPC even after stored consent: if the browser switched
      // GPC on after the user gave consent, downgrade advertising.
      if (hasGPC() && stored.advertising) {
        const downgraded: ConsentState = { ...stored, advertising: false, ts: Date.now() };
        writeStored(downgraded);
        applyToGtag(downgraded);
      }
      return;
    }
    if (hasGPC()) {
      setAdvertising(false);
    }
    setOpen(true);
  }, []);

  // Re-open hook for the footer link.
  useEffect(() => {
    function handler() {
      const stored = readStored();
      if (stored) {
        setAnalytics(stored.analytics);
        setAdvertising(stored.advertising);
      } else if (hasGPC()) {
        setAdvertising(false);
      }
      setShowCustomize(true);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  function commit(next: { analytics: boolean; advertising: boolean }) {
    const state: ConsentState = { ...next, ts: Date.now(), v: 1 };
    const hadCookieBefore = document.cookie.includes(`${COOKIE_KEY}=`);
    writeStored(state);
    applyToGtag(state);
    setOpen(false);
    setShowCustomize(false);
    // In strict-consent regions (EU/EEA/UK/CH) GA4 + AdSense scripts are
    // NOT rendered on first paint until the cookie is present. Once the
    // user grants consent we reload so the next request's layout includes
    // them. Detection uses a header we can't see client-side, so the
    // heuristic is "we had no cookie before AND user granted something."
    // A reload in non-EU is harmless (scripts were already loaded; the
    // gtag consent state was updated in place).
    const grantedSomething = next.analytics || next.advertising;
    if (!hadCookieBefore && grantedSomething) {
      setTimeout(() => { window.location.reload(); }, 50);
    }
  }

  function acceptAll() {
    setAnalytics(true);
    setAdvertising(true);
    commit({ analytics: true, advertising: true });
  }

  function rejectAll() {
    setAnalytics(false);
    setAdvertising(false);
    commit({ analytics: false, advertising: false });
  }

  function saveCustom() {
    commit({ analytics, advertising });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="max-w-3xl mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {!showCustomize ? (
          <div className="p-5 sm:p-6">
            <p className="text-sm font-semibold text-white mb-1">We use cookies</p>
            <p className="text-xs text-[var(--foreground-muted)] mb-4 leading-relaxed">
              Essential cookies keep you signed in. Optional cookies help us measure usage (analytics) and
              show ads (advertising). You can change your choice anytime via the footer.
              {" "}<Link href="/cookie-policy" className="underline hover:text-white">Cookie Policy</Link>
              {" · "}<Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={acceptAll}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={rejectAll}
                className="bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)]/40 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
              >
                Reject all
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="text-sm text-[var(--foreground-muted)] hover:text-white px-3 py-2 transition-colors"
              >
                Customize
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="text-sm font-semibold text-white mb-3">Your privacy choices</p>

            {/* Necessary — locked on */}
            <label className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border)]">
              <div>
                <p className="text-sm font-medium text-white">Necessary</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  Authentication, session, and security. Required for the site to work.
                </p>
              </div>
              <span className="text-xs text-[var(--foreground-muted)] shrink-0 mt-1">Always on</span>
            </label>

            {/* Analytics */}
            <label className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border)] cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Analytics</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  Google Analytics 4 — anonymous usage, feature funnels, error tracking.
                </p>
              </div>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="mt-1 accent-[var(--ratist-red)] shrink-0"
              />
            </label>

            {/* Advertising */}
            <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Advertising</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  Personalized ads via Google AdSense. Off = non-personalized ads only.
                  Treated as a CCPA opt-out of sharing for California residents.
                </p>
              </div>
              <input
                type="checkbox"
                checked={advertising}
                onChange={(e) => setAdvertising(e.target.checked)}
                className="mt-1 accent-[var(--ratist-red)] shrink-0"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button
                onClick={saveCustom}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
              >
                Save preferences
              </button>
              <button
                onClick={acceptAll}
                className="text-sm text-[var(--foreground-muted)] hover:text-white px-3 py-2 transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={rejectAll}
                className="text-sm text-[var(--foreground-muted)] hover:text-white px-3 py-2 transition-colors"
              >
                Reject all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
