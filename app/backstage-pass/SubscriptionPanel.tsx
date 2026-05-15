"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import SignInLink from "@/components/SignInLink";

// All client-side subscription state lives here so the surrounding
// /backstage-pass page can stay a server component (real stats in the
// hero + SSR'd showcase grid for AdSense + SEO crawlers). This panel
// renders one of three states:
//   1. Already a subscriber — show "you're in" + manage button
//   2. Logged-out / non-subscriber — show plan picker + checkout
//   3. Loading — render nothing (parent shell still renders)
//
// `initialIsNative` — passed in by the parent server component after
// reading the User-Agent header. Eliminates the hydration flash where
// iOS WebView users would otherwise briefly see the web purchase UI
// before the client hook resolves. Apple reviewers test for this
// under Guideline 3.1.3.
export default function SubscriptionPanel({ initialIsNative }: { initialIsNative?: boolean }) {
  const { user } = useAuth();
  const { hasPass, status, expiry, loading } = useSubscription();
  const isNativeApp = useIsNativeApp(initialIsNative);
  // Treat unresolved (null) as native so we never show the web
  // purchase UI before the hook resolves. Fail-closed for App Store
  // reviewer safety; web users get the right UI on next paint anyway.
  const showNativeUi = isNativeApp !== false;
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [checkingOut, setCheckingOut] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageLoading, setManageLoading] = useState(false);

  // Detect ?from=ios — set when the iOS app opened this page in
  // Safari via the "Subscribe on the web" link. We thread it through
  // checkout so Stripe's success_url redirects back here with the
  // same flag, and we use the flag on the success screen to render a
  // "Return to The Ratist app" button (universal link).
  const fromIos = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("from") === "ios";

  async function handleCheckout() {
    if (!user) return;
    setCheckingOut(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/subscription/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan, fromIos }),
    });
    if (res.ok) {
      const { url } = await res.json();
      if (url) window.location.href = url;
    }
    setCheckingOut(false);
  }

  async function handleManage() {
    if (!user || manageLoading) return;
    setManageLoading(true);
    setManageError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setManageError(data.error ?? "Couldn't open the billing portal. Please try again later.");
        setManageLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setManageError("The billing portal didn't return a URL.");
    } catch {
      setManageError("Network error — please try again.");
    }
    setManageLoading(false);
  }

  if (loading) return null;

  // Stripe success/cancel banner (post-redirect)
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const justSubscribed = search?.get("success") === "1";

  return (
    <>
      {/* Already subscribed — show pass-active card + manage button */}
      {hasPass && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-8 text-center">
          <p className="text-lg font-semibold text-emerald-400 mb-2">You have the Backstage Pass!</p>
          {status === "admin_granted" ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Admin-granted Backstage Pass — managed by Ratist staff.
              {expiry && (
                <> Expires{" "}
                  <span className="text-white">
                    {new Date(expiry).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                  .
                </>
              )}
              {!expiry && " No expiration."}
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">Enjoy all premium features.</p>
              {showNativeUi ? (
                // Reader-app gating: don't link to Stripe billing
                // portal from inside the native app — Apple treats
                // that as an external purchase mechanism.
                <p className="text-xs text-[var(--foreground-muted)]">
                  Manage your subscription at theratist.com on a web browser.
                </p>
              ) : (
                <>
                  <button
                    onClick={handleManage}
                    disabled={manageLoading}
                    className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
                  >
                    {manageLoading ? "Opening..." : "Manage Subscription"}
                  </button>
                  {manageError && <p className="text-xs text-red-400 mt-2">{manageError}</p>}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Native users get a real link that opens the system browser
          (Safari/Chrome). They complete checkout on the web, then
          return to the app via the universal link on the success page. */}
      {showNativeUi && !hasPass && (
        <div className="bg-[var(--surface)] border border-amber-400/30 rounded-2xl p-8 text-center mb-10">
          <p className="text-base font-semibold text-amber-400 mb-2">Subscribe on the web</p>
          <p className="text-sm text-[var(--foreground-muted)] mb-5">
            Tap below to open your browser. Once you finish signing up, the page will offer to return you here automatically.
          </p>
          <button
            onClick={() => {
              // window.open(url, "_blank") in Capacitor opens the URL
              // in the system browser (Safari/Chrome), not an in-app
              // WebView. That's required by Apple's external-purchase
              // rules — SFSafariViewController doesn't count as "leaving
              // the app." The from=ios flag identifies the origin so
              // the success page can show the return-to-app button.
              window.open("https://www.theratist.com/backstage-pass?from=ios", "_blank");
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors"
          >
            Open theratist.com to subscribe
          </button>
        </div>
      )}

      {/* Pricing toggle — for non-subscribers, OR admin-granted users
          whose free period is about to expire so they can subscribe
          without losing access. */}
      {!showNativeUi && (() => {
        const expiryDate = expiry ? new Date(expiry) : null;
        const expiryInFuture = expiryDate && expiryDate.getTime() > Date.now();
        const showUpgrade = hasPass && status === "admin_granted" && expiryInFuture;
        if (!(!hasPass || showUpgrade)) return null;
        return (
          <div className="mb-10">
            {showUpgrade && expiryDate && (
              <p className="text-center text-sm text-[var(--foreground-muted)] mb-4">
                Subscribe now so you don&apos;t lose access — billing will start on{" "}
                <span className="text-white font-semibold">
                  {expiryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </span>{" "}
                when your free period ends.
              </p>
            )}
            <div className="flex justify-center gap-3 mb-6">
              <button
                onClick={() => setSelectedPlan("monthly")}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  selectedPlan === "monthly" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                $3.99 / month
              </button>
              <button
                onClick={() => setSelectedPlan("annual")}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-colors relative ${
                  selectedPlan === "annual" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                $39.99 / year
                <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Save 17%</span>
              </button>
            </div>

            <div className="text-center">
              {user ? (
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {checkingOut
                    ? "Redirecting to checkout..."
                    : showUpgrade
                      ? `Subscribe — ${selectedPlan === "annual" ? "$39.99/year" : "$3.99/month"} after free period`
                      : `Get Backstage Pass — ${selectedPlan === "annual" ? "$39.99/year" : "$3.99/month"}`}
                </button>
              ) : (
                <SignInLink className="inline-block px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors">
                  Sign in to subscribe
                </SignInLink>
              )}
              <p className="text-xs text-[var(--foreground-muted)] mt-3">Cancel anytime. Stripe-secured checkout.</p>
            </div>
          </div>
        );
      })()}

      {/* Stripe success banner — shown only after a successful checkout
          redirect (?success=1). Lives in the client panel because it
          reads window.location. */}
      {justSubscribed && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-8 text-center">
          <p className="text-emerald-400 font-medium">
            Welcome to the Backstage Pass! Your premium features are now active.
          </p>
          {/* When the user started checkout from the iOS app
              (?from=ios threaded through Stripe's success_url),
              surface an explicit return-to-app link. Tapping a
              theratist.com link in Safari triggers iOS's universal-
              link handler — the user gets the "Open in The Ratist
              app" prompt and lands back in the app where they
              started. */}
          {fromIos && (
            <a
              href="https://www.theratist.com/backstage-pass?success=1"
              className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors"
            >
              Return to The Ratist app →
            </a>
          )}
        </div>
      )}
    </>
  );
}
