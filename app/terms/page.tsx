import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: April 20, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[var(--foreground-muted)] text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using The Ratist (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
          <p>
            The Ratist is a movie and TV show review platform that provides personalized ratings based on
            criteria-based analysis. The Service includes features such as rating movies and TV shows,
            writing reviews, creating watchlists, participating in community features, and discovering
            new content through personalized recommendations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. User Accounts</h2>
          <p>
            To access certain features, you must create an account. You are responsible for maintaining
            the confidentiality of your account credentials and for all activities that occur under your account.
            You agree to provide accurate information and to update it as necessary.
          </p>
          <p className="mt-2">
            You must be at least 13 years of age to use this Service. By creating an account, you represent
            that you meet this age requirement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. User Content</h2>
          <p>
            You retain ownership of any content you submit, including reviews, comments, and ratings.
            By posting content, you grant The Ratist a non-exclusive, worldwide, royalty-free license
            to use, display, and distribute your content within the Service.
          </p>
          <p className="mt-2">
            You agree not to post content that is illegal, harmful, threatening, abusive, harassing,
            defamatory, vulgar, obscene, or otherwise objectionable. The Ratist reserves the right to
            remove any content that violates these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Community Guidelines</h2>
          <p>Users of The Ratist agree to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Treat other users with respect</li>
            <li>Not engage in spam, harassment, or bullying</li>
            <li>Use spoiler tags when discussing plot details</li>
            <li>Not create multiple accounts to manipulate ratings or reviews</li>
            <li>Not attempt to game or manipulate the rating algorithm</li>
            <li>Report content that violates these guidelines</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Intellectual Property</h2>
          <p>
            The Ratist&apos;s rating algorithm, design, and original content are the intellectual property
            of The Ratist. Movie and TV show data is provided by The Movie Database (TMDB) and is used
            in accordance with their API terms of service. The Ratist is not endorsed or certified by TMDB.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Account Suspension and Termination</h2>
          <p>
            The Ratist reserves the right to suspend or terminate accounts that violate these Terms of Service
            or Community Guidelines. Suspended accounts may be subject to temporary or permanent bans.
            Soft-deleted accounts are retained for 30 days before permanent deletion.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Privacy</h2>
          <p>
            Your use of the Service is also governed by our data handling practices. We collect
            information necessary to provide the Service, including account information, ratings,
            reviews, and usage data. We do not sell your personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services including Google Authentication,
            The Movie Database (TMDB), and advertising partners. Your use of these integrations
            is subject to their respective terms of service and privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">10. AI-Powered Features</h2>
          <p>
            The Service includes optional AI-powered features (such as natural-language recommendations,
            AI-generated collections, and AI-summarized community reviews). These features rely on
            third-party large language models and incur per-call costs to The Ratist.
          </p>
          <p className="mt-2">
            AI features are subject to rate limits and daily usage caps. The Ratist reserves the right,
            at its sole discretion, to further limit, throttle, suspend, or permanently revoke your
            access to AI features — including for Backstage Pass subscribers — if your usage appears
            automated, abusive, disproportionate to normal use, or intentionally designed to consume
            service resources. We may apply these restrictions without prior notice.
          </p>
          <p className="mt-2">
            AI outputs may contain errors, omissions, or outdated information. They are provided for
            convenience only and should not be relied upon as definitive. Individual reviews and
            ratings remain the authoritative source of community opinion on the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">11. Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; without warranties of any kind, either express or implied.
            The Ratist does not guarantee the accuracy, completeness, or reliability of any ratings,
            reviews, or recommendations provided through the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">12. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, The Ratist shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising from your use of the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">13. Changes to Terms</h2>
          <p>
            We reserve the right to update these Terms of Service at any time. We will notify users
            of significant changes through the Service. Continued use of the Service after changes
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">14. Contact</h2>
          <p>
            If you have questions about these Terms of Service, please contact us through the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
