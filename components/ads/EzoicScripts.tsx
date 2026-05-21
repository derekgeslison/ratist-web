import Script from "next/script";

/**
 * Loads the three Ezoic scripts (CMP + Standalone SDK + Analytics) into
 * the document head. Renders nothing visible.
 *
 * Gated on the NEXT_PUBLIC_EZOIC_ENABLED env var — must be exactly "1"
 * to activate. This keeps Ezoic off in local dev (where their consent
 * banner would be distracting + their script would 404 on placement
 * lookups) and off in production until you explicitly flip it on after
 * Incubator approval lands.
 *
 * Load order (matters):
 *   1. Two CMP scripts with strategy="beforeInteractive" so consent
 *      state is established before the standalone SDK loads.
 *   2. Standalone SDK with strategy="afterInteractive" — non-blocking;
 *      doesn't delay first paint.
 *   3. The ezstandalone.cmd queue initializer runs immediately after
 *      so we can safely push callbacks from ad components before the
 *      SDK has fully loaded (Ezoic drains the queue when ready).
 *   4. Analytics script with strategy="afterInteractive".
 */
export default function EzoicScripts() {
  if (process.env.NEXT_PUBLIC_EZOIC_ENABLED !== "1") return null;

  return (
    <>
      {/* data-cfasync="false" tells Cloudflare's Rocket Loader not to
          rewrite these — harmless on Vercel, recommended by Ezoic. */}
      <Script
        id="ezoic-cmp-min"
        src="https://cmp.gatekeeperconsent.com/min.js"
        strategy="beforeInteractive"
        data-cfasync="false"
      />
      <Script
        id="ezoic-cmp"
        src="https://the.gatekeeperconsent.com/cmp.min.js"
        strategy="beforeInteractive"
        data-cfasync="false"
      />
      <Script
        id="ezoic-standalone"
        src="https://www.ezojs.com/ezoic/sa.min.js"
        strategy="afterInteractive"
      />
      <Script id="ezoic-init" strategy="afterInteractive">
        {`window.ezstandalone = window.ezstandalone || {}; window.ezstandalone.cmd = window.ezstandalone.cmd || [];`}
      </Script>
      <Script
        id="ezoic-analytics"
        src="https://ezoicanalytics.com/analytics.js"
        strategy="afterInteractive"
      />
    </>
  );
}
