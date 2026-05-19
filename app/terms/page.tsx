import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: May 10, 2026</p>

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
            The Ratist is a movie and TV review and recommendation platform that combines criteria-based ratings,
            personalized prediction algorithms, and a wide range of community features. The Service includes:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Movie and TV show browsing, rating (Basic and Fanatics formats), reviews, and a personal taste profile.</li>
            <li>Three-layer recommendations and personalized score predictions for unseen titles.</li>
            <li>Watchlists, film diary, &quot;seen&quot; tracking, rankings, and personal analytics.</li>
            <li>Community features including a forum, Hot Takes, Recasts, Looks Like, Pitches, Two Thumbs debates, Movie Maps, news/articles, blog posts, Cine-Q trivia, the Oscar predictor, and Movie Club.</li>
            <li>Real-time social features including Screening Room sessions for synchronized watch-alongs.</li>
            <li>AI-powered tools including natural-language recommendations, AI Collections, AI movie search, and Watch Companion (a scene-aware viewing companion for movies and shows).</li>
            <li>An optional paid subscription tier called Backstage Pass that unlocks additional features (see Section 11).</li>
            <li>Affiliate-linked deep-links to streaming providers, ticketing services, and online retailers (see Section 12).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. User Accounts</h2>
          <p>
            To access most features, you must create an account. Accounts can be created via Google sign-in or with
            an email address and password. Email/password sign-ups must verify their email before they can use
            account-required features.
          </p>
          <p className="mt-2">
            You are responsible for maintaining the confidentiality of your account credentials and for all
            activities that occur under your account. You agree to provide accurate information and to update it
            as necessary.
          </p>
          <p className="mt-2">
            You must be at least 13 years of age to use the Service. By creating an account, you represent that
            you meet this age requirement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. User Content</h2>
          <p>
            You retain ownership of any content you submit, including ratings, reviews, comments, forum threads,
            blog posts, lists, collections, screening-room messages, Watch Companion suggestions, and other
            community submissions. By posting content, you grant The Ratist a non-exclusive, worldwide,
            royalty-free license to host, display, distribute, and adapt that content within the Service and to
            use anonymized or aggregated derivatives of it for product, recommendation, and analytics purposes.
          </p>
          <p className="mt-2">
            You agree not to post content that is illegal, harmful, threatening, abusive, harassing, defamatory,
            vulgar, obscene, infringing, deceptive, or otherwise objectionable. The Ratist reserves the right to
            remove any content that violates these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Community Guidelines</h2>
          <p>Users of The Ratist agree to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Treat other users with respect.</li>
            <li>Not engage in spam, harassment, or bullying.</li>
            <li>Use spoiler tags when discussing plot details.</li>
            <li>Not impersonate other people or misrepresent your identity.</li>
            <li>Not create multiple accounts to manipulate ratings, reviews, votes, or community signal.</li>
            <li>Not attempt to game or manipulate the rating algorithm, recommendation system, or community
              moderation thresholds (including by coordinating votes on Watch Companion suggestions).</li>
            <li>Not abuse rate limits or attempt to circumvent caps on community features (e.g., 2 per 3 days
              on Recasts / Hot Takes / Looks Like, 5 per day on forum threads).</li>
            <li>Not share your invite code with the intent of letting another person impersonate you or pose
              as multiple accounts.</li>
            <li>Report content that violates these guidelines.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Intellectual Property</h2>

          <p>
            <strong className="text-white">6.1 Ownership.</strong> The Service — including its rating
            algorithm, recommendation algorithm, personalization engine, user-interface design, source code,
            copy, branding, badge artwork, original editorial content, compilations of data, and the
            selection, arrangement, and presentation of third-party data — is owned by The Ratist and is
            protected by copyright, trademark, trade-secret, and other intellectual-property laws.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.2 Trademarks.</strong> The Ratist&apos;s product names, logos,
            and branding (including the Ratist &quot;R&quot; logo) are trademarks of The Ratist, claimed under
            common law where not registered. You may not use these marks, or any confusingly similar marks,
            without our prior written permission.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.3 License to you.</strong> Subject to your compliance with these
            Terms, The Ratist grants you a limited, personal, non-exclusive, non-transferable,
            non-sublicensable, revocable license to access and use the Service for your own personal,
            non-commercial use. No other rights are granted, whether by implication, estoppel, or otherwise.
            The Service is licensed to you, not sold.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.4 Prohibited uses.</strong> You agree not to, and not to permit
            any third party to:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              scrape, crawl, harvest, index, or otherwise access the Service by automated means, except for
              public search-engine crawlers obeying our robots.txt;
            </li>
            <li>
              copy, reproduce, distribute, publicly display, or create derivative works of any substantial
              portion of the Service, its data, ratings, recommendations, AI outputs, or content — other than
              your own user content;
            </li>
            <li>
              reverse-engineer, decompile, disassemble, or otherwise attempt to derive the source code,
              algorithms, models, or trade secrets underlying the Service, except to the extent such
              restriction is prohibited by applicable law;
            </li>
            <li>
              use the Service, its data, or its outputs to train, fine-tune, benchmark, or evaluate any
              machine-learning model, or to build, market, or operate a product that competes with the
              Service;
            </li>
            <li>
              remove, obscure, or alter any proprietary notices, attribution, or watermarks contained in the
              Service;
            </li>
            <li>
              circumvent, disable, or interfere with any security, rate-limiting, access-control, or licensing
              mechanism of the Service.
            </li>
          </ul>

          <p className="mt-2">
            <strong className="text-white">6.5 Trade secrets.</strong> The Ratist&apos;s rating formula and
            category weights, recommendation logic, persona-matching algorithm, match-score computation, and
            related proprietary methods are confidential trade secrets of The Ratist. You agree not to
            attempt to derive, document, replicate, or publish these methods, whether by analysis of public
            outputs, scraping, or reverse-engineering.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.6 Third-party content.</strong> Movie, TV, and cast metadata is
            provided by The Movie Database (TMDB) and used in accordance with TMDB&apos;s API terms; The
            Ratist is not endorsed or certified by TMDB. Watch Companion grounding may incorporate
            publicly-available material from sources including Wikipedia (CC BY-SA) and OpenSubtitles, with
            appropriate attribution where required. Third-party trademarks (e.g., streaming-provider names,
            studio names) are the property of their respective owners and are used for identification only.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.7 User content.</strong> Your ownership of, and the license you
            grant to us in, content you submit are governed by Section 4.
          </p>

          <p className="mt-2">
            <strong className="text-white">6.8 Reservation of rights.</strong> All rights not expressly
            granted in these Terms are reserved by The Ratist.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Account Suspension and Termination</h2>
          <p>
            The Ratist reserves the right to suspend, restrict, or terminate accounts that violate these Terms
            of Service or our Community Guidelines. Restrictions may be temporary or permanent and may be
            applied without prior notice. Examples of restrictions include — but are not limited to — disabling
            the ability to submit Watch Companion suggestions, vote, or post in community surfaces.
          </p>
          <p className="mt-2">
            Soft-deleted accounts (whether deleted by you or by us) are retained for 30 days before permanent
            deletion. During that window you may sign in to restore the account or to start fresh.
          </p>
          <p className="mt-2">
            If you believe your account was suspended in error, you may contact us through our{" "}
            <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">contact form</Link>.
            Appeals are reviewed at our discretion.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Privacy</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link href="/privacy" className="text-[var(--ratist-red)] hover:underline">Privacy Policy</Link>,
            which describes what information we collect, how we use it, and how we share it with third parties.
            We do not sell your personal information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Third-Party Services</h2>
          <p>
            The Service integrates with the following third-party services, each subject to its own terms and
            privacy policy:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong className="text-white">Firebase</strong> (Google) — authentication, real-time database for Screening Room sessions and live polls.</li>
            <li><strong className="text-white">Stripe</strong> — payment processing for Backstage Pass subscriptions.</li>
            <li><strong className="text-white">Anthropic</strong> — large-language-model inference for AI features (recommendations, collections, AI movie search, Watch Companion).</li>
            <li><strong className="text-white">The Movie Database (TMDB)</strong> — movie, TV, and cast metadata.</li>
            <li><strong className="text-white">Resend</strong> — transactional and notification email delivery.</li>
            <li><strong className="text-white">Google AdSense</strong> — display advertising.</li>
            <li><strong className="text-white">Google Analytics 4</strong> — product analytics and usage funnels.</li>
            <li><strong className="text-white">Wikipedia</strong> and <strong className="text-white">OpenSubtitles</strong> — public-source grounding for Watch Companion.</li>
            <li><strong className="text-white">GIPHY</strong> — animated image search for community comments.</li>
          </ul>
          <p className="mt-2">
            Your use of these integrations is subject to the respective providers&apos; terms and privacy
            policies. Links are listed in our{" "}
            <Link href="/privacy" className="text-[var(--ratist-red)] hover:underline">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">10. AI-Powered Features</h2>
          <p>
            The Service includes optional AI-powered features. Currently these include the &quot;What Should I
            Watch?&quot; recommender, AI Collections, AI movie search, and Watch Companion (a scene-aware
            viewing companion that includes character glossaries, plot timelines, and recap content). These
            features rely on third-party large language models and incur per-call costs to The Ratist.
          </p>
          <p className="mt-2">
            AI features are subject to rate limits and daily usage caps. The Ratist reserves the right, at its
            sole discretion, to further limit, throttle, suspend, or permanently revoke your access to AI
            features — including for Backstage Pass subscribers — if your usage appears automated, abusive,
            disproportionate to normal use, or intentionally designed to consume service resources. We may
            apply these restrictions without prior notice.
          </p>
          <p className="mt-2">
            AI outputs may contain errors, omissions, or outdated information. They are provided for convenience
            only and should not be relied upon as definitive. Individual reviews and ratings remain the
            authoritative source of community opinion on the Service.
          </p>
          <p className="mt-2">
            <strong className="text-white">Group recommendations:</strong> When you use the &quot;With friends&quot;
            mode of the recommendation tool, your taste profile and seen-content data are combined with those
            of the other members you add (whether by following or by invite code) to compute group-level
            scores. Members added by invite code are added with codes you have explicitly shared.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">11. Backstage Pass Subscription</h2>
          <p>
            Backstage Pass is an optional paid subscription that unlocks additional features such as AI
            Collections building, hosting Screening Rooms, advanced analytics, custom themes, and other
            Backstage-only surfaces. Pricing, billing cadence, and the current feature list are shown on the{" "}
            <Link href="/backstage-pass" className="text-[var(--ratist-red)] hover:underline">Backstage Pass page</Link>.
          </p>
          <p className="mt-2">
            <strong className="text-white">Billing.</strong> Backstage Pass renews automatically on the cadence
            you select at sign-up (monthly or yearly) until you cancel. Payments are processed by Stripe.
            Renewal charges occur at the price in effect at the time of renewal; we will provide notice in
            advance of any price change that affects your subscription.
          </p>
          <p className="mt-2">
            <strong className="text-white">Cancellation.</strong> You may cancel your subscription at any time
            from your <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>.
            Cancellation takes effect at the end of your current billing period; you retain access to Backstage
            features until then. We do not provide pro-rated refunds for the unused portion of a billing period
            except where required by applicable law.
          </p>
          <p className="mt-2">
            <strong className="text-white">Refunds.</strong> Subscription fees are generally non-refundable.
            We may, at our discretion, issue refunds for billing errors, service outages of significant
            duration, or other circumstances we determine warrant a refund. To request a refund, contact us
            through the <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">contact form</Link>.
          </p>
          <p className="mt-2">
            <strong className="text-white">Admin-granted Backstage Pass.</strong> The Ratist may, at its
            discretion, grant Backstage Pass access to specific users (e.g., contest winners, contributors).
            Admin-granted access does not establish a paid subscription and may be revoked at any time. Users
            with admin-granted Backstage Pass are excluded from certain promotional programs (see Section 13).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">12. Affiliate Links and Disclosures</h2>
          <p>
            The Service contains affiliate links to third-party services including streaming providers (e.g.,
            Netflix, Amazon Prime Video, Apple TV+), online retailers (e.g., Amazon Associates), and ticketing
            providers (e.g., Fandango). When you click an affiliate link and complete a qualifying action
            (such as signing up or making a purchase) on the third-party site, The Ratist may earn a
            commission at no additional cost to you.
          </p>
          <p className="mt-2">
            Affiliate links do not influence our editorial content, ratings, recommendations, or the operation
            of the algorithm. The presence of an affiliate link does not constitute an endorsement of the
            third-party service.
          </p>
          <p className="mt-2">
            For purposes of the U.S. Federal Trade Commission&apos;s endorsement and disclosure rules: The
            Ratist is a participant in the Amazon Services LLC Associates Program and other affiliate programs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">13. Promotional Programs</h2>
          <p>
            The Ratist runs occasional promotional programs to reward early users and active raters. Currently
            these include:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong className="text-white">10-review free Backstage Pass:</strong> Users who submit 10 full
              Ratist-format reviews receive 6 months of free Backstage Pass access. Quick / basic ratings and
              imported ratings do not count toward this threshold.
            </li>
            <li>
              <strong className="text-white">100-review lifetime raffle:</strong> When the platform reaches
              1,000 users with 10+ reviews and 10 users with 100+ reviews, we will randomly select 10 winners
              from the 100+-review pool to receive lifetime Backstage Pass access. Conditions and progress are
              shown on the <Link href="/promo" className="text-[var(--ratist-red)] hover:underline">Promo page</Link>.
            </li>
          </ul>
          <p className="mt-2">
            Eligibility is limited to authentic, non-automated activity from a single account. Users with
            admin-granted Backstage Pass, suspended accounts, or accounts under fraud review are excluded.
            We reserve the right to modify, suspend, or end any promotional program at any time, and to
            disqualify any participant whose activity appears coordinated, automated, or otherwise designed
            to game eligibility.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">14. Real-Time Features (Screening Room)</h2>
          <p>
            Screening Room is a real-time social feature that lets users coordinate watch-alongs with chat,
            polls, predictions, and post-watch rating comparisons. By participating in a Screening Room
            session, you acknowledge:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Chat messages, polls, predictions, and reactions are visible to all participants in real time.</li>
            <li>Session metadata (participants, start/end time, polls, peak-activity windows) is retained for
              the post-session recap, which may be shareable depending on the host&apos;s settings.</li>
            <li>Post-watch ratings submitted within a Screening Room session are session-scoped; they do not
              automatically post as your official Ratist review unless you explicitly choose to.</li>
            <li>The host of a session may remove participants and force-close the session.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">15. Community-Submitted Watch Companion Content</h2>
          <p>
            Watch Companion entries are partly community-editable: any user may submit suggestions to add,
            edit, or remove characters, plot facts, glossary terms, relationships, or timeline beats. Some
            suggestions are auto-applied when they reach a community vote threshold, with weighted votes for
            users with established review histories.
          </p>
          <p className="mt-2">
            By submitting a Watch Companion suggestion, you agree it may be applied to the public companion
            without further review and may be later reverted by an admin if it is reported, mis-applied, or
            violates these terms. Original content is preserved in a snapshot at the moment of edit so it can
            always be restored.
          </p>
          <p className="mt-2">
            Suggestion submission privileges may be temporarily or permanently restricted by an admin if we
            detect abuse, spam, vandalism, or coordinated voting.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">16. Invite Codes</h2>
          <p>
            Each account is issued a short alphanumeric invite code, displayed on your profile (hidden behind
            a reveal toggle by default). Sharing your invite code allows other users to add your taste profile
            to their group recommendations, even if they don&apos;t follow you. Treat your code like a soft
            social token: anyone you give it to can pull you into their group sessions until you rotate it.
          </p>
          <p className="mt-2">
            You can request a new invite code from your{" "}
            <Link href="/settings" className="text-[var(--ratist-red)] hover:underline">Settings page</Link>;
            requests are reviewed by an admin to prevent abuse and rotation churn. We may decline regeneration
            requests that appear excessive or coordinated.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">17. Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any
            kind, either express or implied, including without limitation warranties of merchantability,
            fitness for a particular purpose, non-infringement, accuracy, or availability. The Ratist does not
            guarantee the accuracy, completeness, or reliability of any ratings, reviews, recommendations,
            AI outputs, predictions, or information provided through the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">18. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, The Ratist and its operators shall not be liable for any
            indirect, incidental, special, consequential, exemplary, or punitive damages — including loss of
            profits, data, goodwill, or other intangible losses — arising from your use of or inability to use
            the Service, even if we have been advised of the possibility of such damages.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">19. Changes to Terms</h2>
          <p>
            We reserve the right to update these Terms of Service at any time. We will notify users of
            significant changes through the Service (and, where appropriate, via email). The
            &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
            Continued use of the Service after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">20. Contact</h2>
          <p>
            Questions about these Terms of Service can be sent through our{" "}
            <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">contact form</Link>{" "}
            or via the in-product{" "}
            <Link href="/feedback" className="text-[var(--ratist-red)] hover:underline">feedback form</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
