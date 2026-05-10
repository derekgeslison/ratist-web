"use client";

/**
 * Footer link that re-opens the cookie/consent banner. Required by
 * GDPR (revocable consent must be as easy as granting it) and by
 * CCPA / CPRA (a "Your Privacy Choices" surface). The label uses the
 * CCPA-recognized phrase so a single link satisfies both regimes.
 */
export default function CookiePreferencesLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new Event("ratist:open-cookie-prefs"));
      }}
      className={className ?? "hover:text-white transition-colors"}
    >
      Your Privacy Choices
    </button>
  );
}
