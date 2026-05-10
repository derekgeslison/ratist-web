import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cookie Policy", alternates: { canonical: "/cookie-policy" } };

export default function CookiePolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Cookie Policy</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: May 10, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[var(--foreground-muted)] text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">What are cookies?</h2>
          <p>
            Cookies are small text files that websites store on your device. We use cookies and similar
            technologies (such as <code className="text-white/80">localStorage</code> and{" "}
            <code className="text-white/80">sessionStorage</code>) to keep you signed in, remember your
            preferences, measure usage, and serve relevant ads.
          </p>
          <p className="mt-2">
            This page describes the categories we use and what each one does. You can change your choice at
            any time via the{" "}
            <strong className="text-white">Your Privacy Choices</strong> link in the footer.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Categories</h2>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mt-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-base font-semibold text-white">Necessary</h3>
              <span className="text-xs text-[var(--foreground-muted)]">Always on</span>
            </div>
            <p className="text-xs leading-relaxed">
              Required for the site to function. Without these you can&apos;t sign in, your session
              wouldn&apos;t persist across pages, and security checks couldn&apos;t happen. These do not
              require consent and cannot be disabled.
            </p>
            <p className="text-xs mt-2">
              <strong className="text-white">Examples:</strong> Firebase authentication tokens, session ID
              for the current visit, CSRF tokens, your typing-guard / onboarding state, and a small handful of
              UI preferences (theme, default watchlist) saved in <code className="text-white/80">localStorage</code>.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mt-3">
            <h3 className="text-base font-semibold text-white mb-2">Analytics</h3>
            <p className="text-xs leading-relaxed">
              Helps us understand how visitors use the site so we can fix friction and improve features.
              Anonymous in aggregate; we do not use it to identify individual users.
            </p>
            <p className="text-xs mt-2">
              <strong className="text-white">Provider:</strong> Google Analytics 4. <strong className="text-white">Examples of events tracked:</strong>{" "}
              page views, the onboarding-tour funnel, recommendation-tool usage, share-button clicks, and
              AI-feature usage. <strong className="text-white">Default:</strong> off until you opt in.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mt-3">
            <h3 className="text-base font-semibold text-white mb-2">Advertising</h3>
            <p className="text-xs leading-relaxed">
              Personalized ads. When granted, we share signals with Google AdSense and its partners so the
              ads you see are more relevant. When denied, ads still appear but they&apos;re non-personalized
              (selected based only on the page you&apos;re currently looking at, not your prior browsing).
            </p>
            <p className="text-xs mt-2">
              <strong className="text-white">Provider:</strong> Google AdSense. <strong className="text-white">Default:</strong> off until you opt in. Backstage Pass subscribers do not see ads regardless of this setting.
            </p>
            <p className="text-xs mt-2">
              <strong className="text-white">California (CCPA / CPRA):</strong> turning Advertising off
              constitutes an opt-out of cross-context behavioral advertising, which California treats as
              &quot;sharing.&quot; If your browser sends the Global Privacy Control (GPC) signal, we honor it
              automatically and default Advertising to off.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Third-party cookies</h2>
          <p>
            Some cookies are set by third-party services we integrate with. Each provider has its own
            privacy policy:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong className="text-white">Firebase</strong> (Google) — authentication and real-time features.</li>
            <li><strong className="text-white">Google AdSense</strong> — display advertising.</li>
            <li><strong className="text-white">Google Analytics 4</strong> — product analytics.</li>
            <li><strong className="text-white">Stripe</strong> — payment processing for subscriptions.</li>
            <li><strong className="text-white">GIPHY</strong> — animated image search inside community comments.</li>
          </ul>
          <p className="mt-2">
            Full provider list and links to each privacy policy are in our{" "}
            <Link href="/privacy" className="text-[var(--ratist-red)] hover:underline">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Managing your choices</h2>
          <p>You can manage cookies in three places:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              The <strong className="text-white">Your Privacy Choices</strong> link in our footer reopens
              the consent banner so you can change Analytics or Advertising at any time.
            </li>
            <li>
              Your browser&apos;s settings let you block or delete cookies for any site. Note: blocking
              <em> all </em> cookies will break sign-in.
            </li>
            <li>
              Google offers separate per-product controls:{" "}
              <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Ads Settings</a>{" "}
              and{" "}
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Analytics Opt-out</a>.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Changes to this policy</h2>
          <p>
            We may update this Cookie Policy when we add, remove, or change the cookies we use. The
            &quot;Last updated&quot; date at the top of this page reflects the most recent revision. If we
            add a new category, we will re-prompt you for consent.
          </p>
        </section>
      </div>
    </div>
  );
}
