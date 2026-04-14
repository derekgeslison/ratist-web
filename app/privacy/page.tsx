import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: April 14, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[var(--foreground-muted)] text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Introduction</h2>
          <p>
            The Ratist (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates theratist.com (the &quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services. By using the Service, you consent to the practices described in this policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>

          <h3 className="text-base font-medium text-white mt-4 mb-1">2.1 Information You Provide</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Account information:</strong> Name, email address, and profile photo when you create an account (via email/password or Google sign-in).</li>
            <li><strong className="text-white">Profile data:</strong> Display name, avatar, biography, genre preferences, and viewing component preferences you choose to share.</li>
            <li><strong className="text-white">Ratings and reviews:</strong> Movie and TV show ratings, written reviews, and all associated rating criteria you submit.</li>
            <li><strong className="text-white">User-generated content:</strong> Forum posts, comments, watchlists, diary entries, community submissions (Hot Takes, Recasts, Looks Like, Pitches), and any other content you create on the platform.</li>
            <li><strong className="text-white">Import data:</strong> If you choose to import your viewing history (e.g., from IMDb), we process that data to create ratings on your behalf.</li>
            <li><strong className="text-white">Payment information:</strong> If you subscribe to the Backstage Pass, payment is processed by Stripe. We do not store your credit card details — Stripe handles all payment data securely.</li>
          </ul>

          <h3 className="text-base font-medium text-white mt-4 mb-1">2.2 Information Collected Automatically</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Usage data:</strong> Pages visited, features used, time spent on the site, and interactions with content (views, clicks, searches).</li>
            <li><strong className="text-white">Device information:</strong> Browser type, operating system, screen resolution, and device identifiers.</li>
            <li><strong className="text-white">Log data:</strong> IP address, access times, and referring URLs.</li>
            <li><strong className="text-white">Cookies and similar technologies:</strong> See Section 5 below.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Generate personalized movie and TV show recommendations based on your ratings and preferences.</li>
            <li>Calculate your Ratist rating scores and community averages.</li>
            <li>Match you with users who share similar taste profiles.</li>
            <li>Send transactional emails (account verification, subscription confirmations, password resets).</li>
            <li>Send optional notification emails (promotional offers, subscription reminders). You can opt out of these at any time via the unsubscribe link in each email or from your profile settings.</li>
            <li>Display relevant advertisements through Google AdSense (see Section 6).</li>
            <li>Monitor and enforce our <Link href="/terms" className="text-[var(--ratist-red)] hover:underline">Terms of Service</Link>.</li>
            <li>Detect and prevent fraud, abuse, and security incidents.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. How We Share Your Information</h2>
          <p><strong className="text-white">We do not sell your personal information.</strong></p>
          <p className="mt-2">We may share information with:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Service providers:</strong> Third-party services that help us operate the platform, including Firebase (authentication), Neon/Google Cloud (database hosting), Resend (email delivery), Stripe (payment processing), and Google AdSense (advertising).</li>
            <li><strong className="text-white">Other users:</strong> Your public profile, ratings, reviews, and community contributions are visible to other users of the Service. Your email address is never publicly displayed.</li>
            <li><strong className="text-white">Legal requirements:</strong> If required by law, regulation, or legal process, or to protect the rights, property, or safety of The Ratist, our users, or the public.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Cookies and Tracking Technologies</h2>
          <p>We use cookies and similar technologies for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Essential cookies:</strong> Required for authentication, session management, and security. These cannot be disabled.</li>
            <li><strong className="text-white">Analytics cookies:</strong> Help us understand how visitors interact with the site, which pages are most popular, and where users encounter issues.</li>
            <li><strong className="text-white">Advertising cookies:</strong> Used by Google AdSense and its partners to display relevant advertisements. These cookies may track your browsing activity across websites to deliver personalized ads.</li>
          </ul>
          <p className="mt-2">
            You can manage cookie preferences through your browser settings. Disabling cookies may affect some features of the Service. For more information on how Google uses data from sites that use their services, visit{" "}
            <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google&apos;s privacy page</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Advertising</h2>
          <p>
            We use Google AdSense to display advertisements on the Service. Google AdSense uses cookies to serve ads based on your prior visits to our website and other websites. Google&apos;s use of advertising cookies enables it and its partners to serve ads based on your browsing patterns.
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
            <li><strong className="text-white">Firebase</strong> (Google) — Authentication and real-time features. <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Firebase Privacy</a></li>
            <li><strong className="text-white">Stripe</strong> — Payment processing for subscriptions. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Stripe Privacy</a></li>
            <li><strong className="text-white">The Movie Database (TMDB)</strong> — Movie and TV show data. <a href="https://www.themoviedb.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">TMDB Privacy</a></li>
            <li><strong className="text-white">Google AdSense</strong> — Advertising. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Privacy</a></li>
            <li><strong className="text-white">Resend</strong> — Email delivery. <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Resend Privacy</a></li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you delete your account, your data enters a 30-day soft-delete period during which you can recover your account. After 30 days, your data is permanently deleted from our systems.
          </p>
          <p className="mt-2">
            Anonymized or aggregated data (such as community rating averages) may be retained indefinitely as it cannot be linked back to individual users.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong className="text-white">Correction:</strong> Request correction of inaccurate personal data.</li>
            <li><strong className="text-white">Deletion:</strong> Request deletion of your personal data. You can delete your account from your profile settings.</li>
            <li><strong className="text-white">Opt-out of marketing:</strong> Unsubscribe from promotional emails via the link in each email or from your profile settings.</li>
            <li><strong className="text-white">Data portability:</strong> Request your data in a portable format.</li>
            <li><strong className="text-white">Opt-out of personalized ads:</strong> Manage ad personalization via <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-[var(--ratist-red)] hover:underline">Google Ads Settings</a>.</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:privacy@theratist.com" className="text-[var(--ratist-red)] hover:underline">privacy@theratist.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">10. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal data, please contact us and we will promptly delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">11. Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal data, including encrypted connections (HTTPS), secure authentication via Firebase, and access controls on our database and infrastructure. However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after changes are posted constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">13. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, please contact us at{" "}
            <a href="mailto:privacy@theratist.com" className="text-[var(--ratist-red)] hover:underline">privacy@theratist.com</a>{" "}
            or use our <Link href="/feedback" className="text-[var(--ratist-red)] hover:underline">feedback form</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
