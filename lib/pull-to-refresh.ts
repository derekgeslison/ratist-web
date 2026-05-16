// Wrapper around the custom Capacitor PullToRefresh plugin. Lets JS
// temporarily suspend the native pull-to-refresh gesture while the
// user is touching a scrollable popup (hamburger menu, modal sheet,
// etc.) — without this, the SwipeRefreshLayout sitting above the
// WebView misfires as "pull to refresh" the moment the popup's
// internal overflow:auto container hits scroll position 0.
//
// No-op everywhere except inside the Capacitor app.

import { Capacitor, registerPlugin } from "@capacitor/core";

interface PullToRefreshPlugin {
  setBlocked(opts: { blocked: boolean }): Promise<{ ok: boolean }>;
}

// IMPORTANT: registerPlugin MUST be at module level, NOT inside an
// async function — see lib/live-activity.ts for the full explanation
// (the proxy's .then-intercept-on-property-access pitfall).
const PullToRefresh = registerPlugin<PullToRefreshPlugin>("PullToRefresh");

function shouldCall(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

export async function setPullToRefreshBlocked(blocked: boolean): Promise<void> {
  if (!shouldCall()) return;
  try {
    await PullToRefresh.setBlocked({ blocked });
  } catch {
    // Plugin not present in this build (older APK). Silent — the
    // pull-to-refresh bug just doesn't get fixed for that user.
  }
}
