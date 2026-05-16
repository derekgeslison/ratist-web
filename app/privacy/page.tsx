import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: May 10, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[var(--foreground-muted)] text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Introduction</h2>
          <p>
            The Ratist (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates theratist.com (the &quot;Service&quot;).
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you
            visit our website and use our services. By using the Service, you consent to the practices described
            in this policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>

          <h3 className="text-base font-medium text-white mt-4 mb-1">2.1 Information You Provide</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Account information:</strong> name, email address, and profile photo when you create an account (via email/password, Google, or Apple sign-in). If you choose Apple&apos;s &ldquo;Hide My Email&rdquo; option, we receive a private relay address (<code className="text-xs bg-[var(--surface)] px-1 py-0.5 rounded">@privaterelay.appleid.com</code>) instead of your real email; messages we send are forwarded by Apple.</li>
            <li><strong className="text-white">Profile data:</strong> display name, avatar, biography, genre and component preferences, profile theme, and privacy settings.</li>
            <li><strong className="text-white">Ratings and reviews:</strong> movie and TV show ratings (Basic and Fanatics formats), all rubric scores, written reviews, and any optional fields you complete.</li>
            <li><strong className="text-white">User-generated content:</strong> forum threads and posts, blog and editorial comments, forum poll votes and debate votes, watchlists, film diary entries, &quot;seen&quot; entries, rankings, custom collections (and saves of others&apos; collections), Hot Takes, Recasts, Looks Like submissions, Pitches, Two Thumbs votes, Movie Club ratings and reactions, Movie Club nomination votes, Cine-Q gameplay records, Oscar predictions, Watch Companion suggestions and votes, Screening Room chat / polls / predictions / bookmarks, comments and reactions across all surfaces, follow relationships, and feedback / contact submissions.</li>
            <li><strong className="text-white">Invite-code requests:</strong> when you request a new invite code, we record the request, an optional reason you provide, and the resulting decision and admin notes.</li>
            <li><strong className="text-white">Import data:</strong> if you choose to import your viewing history (e.g., from IMDb or Letterboxd), we process that data to create ratings on your behalf.</li>
            <li><strong className="text-white">Payment information:</strong> if you subscribe to Backstage Pass, payment is processed by Stripe. We do not store your credit-card details — Stripe handles all payment data securely. We retain a Stripe customer / subscription identifier and the resulting subscription status, expiry, and tier.</li>
          </ul>

          <h3 className="text-base font-medium text-white mt-4 mb-1">2.2 Information Collected Automatically</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Usage data:</strong> pages visited, features used, time spent, content interactions (views, likes, comments, searches, recommendation requests), and analytics events (e.g., onboarding-tour funnel, share-button clicks, AI-tool prompts).</li>
            <li><strong className="text-white">Device information:</strong> browser type, operating system, screen resolution, and device identifiers.</li>
            <li><strong className="text-white">Log data:</strong> IP address, access times, referring URLs, and (for AI features) per-call audit logs that record the user, feature, and timestamp — used for rate-limit enforcement and abuse detection. Prompt content is not retained beyond what the third-party provider may retain under its own policy (see Section 13).</li>
            <li><strong className="text-white">Affiliate-link clicks:</strong> when you click an affiliate link, we record that the click happened (which provider, which item) so we can measure outbound conversion. Click logs do not include any payment or purchase details from the destination site.</li>
            <li><strong className="text-white">Cookies and similar technologies:</strong> see Section 5 below.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Generate personalized recommendations and predicted score estimates for movies and shows you haven&apos;t rated yet.</li>
            <li>Calculate Ratist rating scores, community averages, and aggregate statistics.</li>
            <li>Match you with users who share similar taste profiles, and — when you use the &quot;With friends&quot;
              mode of the recommendation tool — combine your taste profile with those of group members
              (added by follow or by invite code) to compute group-level scores.</li>
            <li>Award badges, track milestones, and surface achievements on your profile.</li>
            <li>Send transactional emails (account verification, subscription confirmations, password resets, ban or policy notices).</li>
            <li>Send optional notification emails and in-app notifications you have opted into (promotional offers, subscription reminders, follow / movie-club / Watch Companion / forum-thread activity). You can opt out of optional categories at any time via the unsubscribe link in each email or from your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>.</li>
            <li>Display relevant advertisements through Google AdSense (see Section 6).</li>
            <li>Monitor and enforce our <Link href="/terms" className="text-[var(--ratist-red)] hover:underline">Terms of Service</Link>, including reviewing reports, fraud flags, and admin queues.</li>
            <li>Detect and prevent fraud, abuse, and security incidents — including coordinated voting on community moderation surfaces.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. How We Share Your Information</h2>
          <p><strong className="text-white">We do not sell your personal information.</strong></p>
          <p className="mt-2">We share information in the following circumstances:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Service providers:</strong> third parties that help us operate the platform — see Section 7 for the full list.</li>
            <li><strong className="text-white">AI providers:</strong> when you use AI-powered features, the input prompt (which may include your stated preferences, free-text mood description, or comparable text) is sent to Anthropic for inference. We do not include your email address, account ID, or other directly-identifying personal information in those prompts. See Section 13.</li>
            <li><strong className="text-white">Other users:</strong> your public profile, ratings, reviews, watch-history (where you have not made it private), and community contributions are visible to other users of the Service. Your email address is never publicly displayed. Your invite code is hidden by default on your profile and only revealed if you choose to display it.</li>
            <li><strong className="text-white">Friend / group recommendations:</strong> if another user adds you to a group recommendation session — by following you or by entering your invite code — your taste profile and seen-content list are used to compute group-level scores for that session. Your individual ratings are not exposed to those other users beyond what is already publicly visible on your profile. You can rotate your invite code from <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings</Link> to break this access.</li>
            <li><strong className="text-white">Legal requirements:</strong> if required by law, regulation, subpoena, or other valid legal process, or to protect the rights, property, or safety of The Ratist, our users, or the public.</li>
            <li><strong className="text-white">Business transfers:</strong> if The Ratist undergoes a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you before your information becomes subject to a different privacy policy.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Cookies and Tracking Technologies</h2>
          <p>We use cookies and similar technologies for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Essential cookies:</strong> required for authentication, session management, and security. These cannot be disabled.</li>
            <li><strong className="text-white">Analytics cookies:</strong> Google Analytics 4 helps us understand how visitors interact with the site, which features are used, and where users encounter issues. Specific events we track include the onboarding tour funnel, recommendation-tool usage, share-button clicks, and AI-feature usage.</li>
            <li><strong className="text-white">Advertising cookies:</strong> used by Google AdSense and its partners to display relevant advertisements. These cookies may track your browsing activity across websites to deliver personalized ads.</li>
          </ul>
          <p className="mt-2">
            Optional categories (Analytics and Advertising) are off by default and only enable after you
            consent via our cookie banner. You can change your choice at any time using the
            <strong className="text-white"> Your Privacy Choices</strong> link in the footer, which reopens
            the banner. See our{" "}
            <Link href="/cookie-policy" className="text-[var(--ratist-red)] hover:underline">Cookie Policy</Link>{" "}
            for the full list of cookies in each category.
          </p>
          <p className="mt-2">
            You can also manage cookies through your browser settings, though blocking all cookies will break
            sign-in. For more information on how Google uses data from sites that use their services, visit{" "}
            <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google&apos;s privacy page</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Advertising</h2>
          <p>
            We use Google AdSense to display advertisements on the Service. Google AdSense uses cookies to
            serve ads based on your prior visits to our website and other websites. Google&apos;s use of
            advertising cookies enables it and its partners to serve ads based on your browsing patterns.
          </p>
          <p className="mt-2">
            You may opt out of personalized advertising by visiting{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Ads Settings</a>{" "}
            or by visiting{" "}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">aboutads.info</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Third-Party Services</h2>
          <p>The Service integrates with the following third-party services, each with their own privacy policies:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Firebase</strong> (Google) — authentication, real-time database for Screening Room sessions and live polls. <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Firebase Privacy</a></li>
            <li><strong className="text-white">Sign in with Apple</strong> — optional identity provider for account creation and login. When used, Apple may send us a private relay email address rather than your real email. <a href="https://www.apple.com/legal/privacy/data/en/sign-in-with-apple/" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Apple Privacy</a></li>
            <li><strong className="text-white">Anthropic</strong> — large-language-model inference for AI features (recommendations, AI Collections, AI movie search, Watch Companion). <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Anthropic Privacy</a></li>
            <li><strong className="text-white">Stripe</strong> — payment processing for subscriptions. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Stripe Privacy</a></li>
            <li><strong className="text-white">The Movie Database (TMDB)</strong> — movie and TV show metadata. <a href="https://www.themoviedb.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">TMDB Privacy</a></li>
            <li><strong className="text-white">Google AdSense</strong> &amp; <strong className="text-white">Google Analytics 4</strong> — advertising and analytics. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Privacy</a></li>
            <li><strong className="text-white">Google reCAPTCHA</strong> — bot protection on email/password account creation. Loads on the sign-up form only. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Privacy</a></li>
            <li><strong className="text-white">Resend</strong> — email delivery. <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Resend Privacy</a></li>
            <li><strong className="text-white">Vercel</strong> — application hosting and edge-network delivery. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Vercel Privacy</a></li>
            <li><strong className="text-white">Neon</strong> — managed PostgreSQL database. <a href="https://neon.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Neon Privacy</a></li>
            <li><strong className="text-white">Wikipedia</strong> &amp; <strong className="text-white">OpenSubtitles</strong> — public-source grounding for Watch Companion (read-only fetches; no user data is sent).</li>
            <li><strong className="text-white">GIPHY</strong> — animated image search inside community comments. <a href="https://support.giphy.com/hc/en-us/articles/360032872931" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">GIPHY Privacy</a></li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you delete your account,
            your data enters a 30-day soft-delete period during which you can recover the account by signing
            in. During this window your display name, avatar, and bio are immediately replaced with a generic
            &ldquo;Deleted user&rdquo; placeholder on all public surfaces (comments, reviews, forum posts, etc.)
            so your identity stops being shown; the original values are preserved only as an internal restore
            snapshot. After 30 days, your data is permanently deleted from our systems.
          </p>
          <p className="mt-2">
            Anonymized or aggregated data (such as community rating averages, popularity metrics, and rating
            distributions) may be retained indefinitely as it cannot be linked back to individual users.
          </p>
          <p className="mt-2">
            AI usage logs (user, feature, timestamp — not prompt content) are retained for up to 30 days for
            rate-limit enforcement, with a per-feature daily-cap audit window of 30 days. Affiliate click
            logs are retained for up to 24 months for commission reconciliation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Affiliate Click Tracking</h2>
          <p>
            The Service contains affiliate links to third-party services (streaming providers, online retailers,
            ticketing services, music services). When you click an affiliate link, we record the click — which
            provider, which item, and the timestamp — so we can measure outbound conversion. We do not see
            payment or purchase details on the destination site; the affiliate program reports to us only an
            aggregated count of qualifying actions.
          </p>
          <p className="mt-2">
            See Section 12 of our <Link href="/terms" className="text-[var(--ratist-red)] hover:underline">Terms of Service</Link> for
            the full affiliate disclosure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">10. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Access:</strong> request a copy of the personal data we hold about you. You can download a portable export (a zip of CSV files covering ratings, diary, watchlists, comments, badges, and other personal data) from your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>, available once per day.</li>
            <li><strong className="text-white">Correction:</strong> request correction of inaccurate personal data via your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link> or by contacting us.</li>
            <li><strong className="text-white">Deletion:</strong> delete your account from your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>. Soft-deleted accounts can be recovered within 30 days; after that, deletion is permanent.</li>
            <li><strong className="text-white">Opt-out of marketing:</strong> unsubscribe from optional emails via the link in each email or from your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>.</li>
            <li><strong className="text-white">Data portability:</strong> use the data-export feature on your Settings page.</li>
            <li><strong className="text-white">Opt-out of personalized ads:</strong> manage ad personalization via <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Ads Settings</a>.</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, visit your{" "}
            <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>{" "}
            or contact us via our{" "}
            <Link href="/feedback" className="text-[var(--ratist-red)] hover:underline">feedback form</Link>{" "}
            or <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">contact form</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">11. California Residents (CCPA / CPRA)</h2>
          <p>
            If you are a California resident, the California Consumer Privacy Act (as amended by the CPRA)
            grants you specific rights, including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Right to Know</strong> what personal information we have collected, used, disclosed, and shared about you.</li>
            <li><strong className="text-white">Right to Delete</strong> personal information we have collected, subject to exceptions in the CCPA.</li>
            <li><strong className="text-white">Right to Correct</strong> inaccurate personal information.</li>
            <li><strong className="text-white">Right to Opt Out of Sale or Sharing.</strong> We do not sell personal information for monetary consideration. We do disclose information to advertising partners (e.g., Google AdSense) for cross-context behavioral advertising, which California treats as &quot;sharing.&quot; You can opt out of this sharing via the personalized-ad controls in Section 6 and Section 10.</li>
            <li><strong className="text-white">Right to Non-Discrimination</strong> for exercising any CCPA right.</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, see Section 10. We will not discriminate against you for exercising
            any of your CCPA rights.
          </p>
          <p className="mt-2">
            <strong className="text-white">To request correction</strong> of personal data we hold about you
            that you cannot edit yourself via the Settings page, email{" "}
            <a href="mailto:theratistreview@gmail.com" className="text-[var(--ratist-red)] hover:underline">
              theratistreview@gmail.com
            </a>
            {" "}with the specific item you&apos;d like corrected. We&apos;ll respond within 45 days as required by CPRA.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">12. European Residents (GDPR)</h2>
          <p>
            If you are in the European Economic Area, the United Kingdom, or Switzerland, the General Data
            Protection Regulation (and equivalent local laws) grants you additional rights regarding your
            personal data.
          </p>
          <p className="mt-2"><strong className="text-white">Lawful bases for processing.</strong> We process your personal data on the following lawful bases:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Performance of a contract</strong> — to deliver the Service you have signed up for (account, ratings, recommendations, subscription billing).</li>
            <li><strong className="text-white">Consent</strong> — for optional categories such as promotional emails, advertising cookies, and AI-feature usage. You can withdraw consent at any time without affecting prior processing.</li>
            <li><strong className="text-white">Legitimate interests</strong> — for fraud prevention, abuse detection, security, analytics, and improving the Service. These interests are balanced against your privacy rights.</li>
            <li><strong className="text-white">Legal obligation</strong> — when required to comply with applicable law.</li>
          </ul>
          <p className="mt-2"><strong className="text-white">Your GDPR rights</strong> include access, rectification, erasure (&quot;right to be forgotten&quot;), restriction of processing, data portability, objection to processing, and the right to lodge a complaint with your local data protection authority. See Section 10 for how to exercise these rights.</p>
          <p className="mt-2"><strong className="text-white">International transfers.</strong> Some of our service providers (e.g., Firebase, Anthropic, Stripe, Vercel, Google) are based in the United States. Where required, transfers are made under appropriate safeguards such as the EU-U.S. Data Privacy Framework or Standard Contractual Clauses.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">13. AI Data Handling</h2>
          <p>
            When you use AI-powered features (the &quot;What Should I Watch?&quot; recommender, AI Collections,
            AI movie search, or Watch Companion), the input we send to the AI provider includes the structured
            filter data and any free-text prompt you typed. We do not include your email address, account ID,
            or other directly-identifying personal information in the prompt body.
          </p>
          <p className="mt-2">
            Anthropic, our current AI provider, processes the prompt to generate the response. Their retention
            policy is governed by Anthropic&apos;s privacy policy linked in Section 7. The Ratist itself does
            not retain prompt content beyond the lifetime of the request, except where required to investigate
            abuse or rate-limit violations.
          </p>
          <p className="mt-2">
            We retain a per-call audit log (user, feature, timestamp — not prompt content) for up to 30 days
            for rate-limit enforcement and abuse detection.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">14. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to children under the age of 13. We do not knowingly collect personal
            information from children under 13. If you believe a child under 13 has provided us with personal
            data, please contact us and we will promptly delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">15. Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal data,
            including encrypted connections (HTTPS), secure authentication via Firebase, and access controls
            on our database and infrastructure. However, no method of electronic storage or transmission is
            100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">16. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by
            posting the new policy on this page and updating the &quot;Last updated&quot; date. Material changes
            may also be communicated by email. Your continued use of the Service after changes are posted
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">17. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, use our{" "}
            <Link href="/feedback" className="text-[var(--ratist-red)] hover:underline">feedback form</Link>{" "}
            or <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">contact form</Link>,
            or manage your data from your{" "}
            <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
