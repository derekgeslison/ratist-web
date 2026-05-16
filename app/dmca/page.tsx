import Link from "next/link";

export default function DmcaPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">DMCA Notices</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">Last updated: May 14, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[var(--foreground-muted)] text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Overview</h2>
          <p>
            The Ratist (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) responds to clear notices of alleged copyright
            infringement under the Digital Millennium Copyright Act (&quot;DMCA&quot;), 17 U.S.C.
            &sect; 512. This page describes how to submit a takedown notice, how to file a
            counter-notice if your material was removed in error, and our policy regarding
            repeat infringers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Designated Agent</h2>
          <p>
            Notifications of claimed infringement should be sent to our designated DMCA agent.
            Our agent is registered with the United States Copyright Office; you may also
            view the public registration at{" "}
            <a
              href="https://dmca.copyright.gov/osp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--ratist-red)] hover:underline"
            >
              dmca.copyright.gov/osp
            </a>
            .
          </p>
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs leading-relaxed not-prose">
            <p className="text-white font-semibold mb-2">DMCA Designated Agent</p>
            <p>Derek Geslison</p>
            <p>The Ratist</p>
            <p>2919 E 80 S</p>
            <p>Spanish Fork, UT 84660</p>
            <p>United States</p>
            <p className="mt-2">Email: theratistreview@gmail.com</p>
            <p>Phone: (435) 744-7007</p>
            <p className="mt-2 text-[var(--foreground-muted)]">USCO Registration: DMCA-1072811</p>
          </div>
          <p className="text-xs italic mt-2">
            Email is the fastest channel and is generally preferred. Notices delivered by other
            means may take longer to process.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Filing a Takedown Notice</h2>
          <p>
            To be effective under the DMCA, your written notification must include all of the
            following (17 U.S.C. &sect; 512(c)(3)(A)):
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              A physical or electronic signature of a person authorized to act on behalf of the
              owner of the exclusive right that is allegedly infringed.
            </li>
            <li>
              Identification of the copyrighted work claimed to have been infringed (or, for a
              representative list of works at the site, a list of those works).
            </li>
            <li>
              Identification of the material claimed to be infringing or the subject of
              infringing activity, with information reasonably sufficient to permit us to locate
              the material (typically a direct URL on{" "}
              <span className="font-mono">theratist.com</span>).
            </li>
            <li>
              Your name, mailing address, telephone number, and email address.
            </li>
            <li>
              A statement that you have a good-faith belief that the disputed use is not
              authorized by the copyright owner, its agent, or the law.
            </li>
            <li>
              A statement, made under penalty of perjury, that the information in your
              notification is accurate and that you are the copyright owner or are authorized
              to act on behalf of the owner of an exclusive right that is allegedly infringed.
            </li>
          </ol>
          <p className="mt-3">
            Notices missing any of the items above may not be valid under the DMCA and may
            delay or prevent action. We may, at our discretion, share the entire notice
            (including your contact information) with the user who posted the allegedly
            infringing material.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Counter-Notice</h2>
          <p>
            If you believe content of yours was removed or disabled by mistake or
            misidentification, you may submit a counter-notice that includes all of the
            following (17 U.S.C. &sect; 512(g)(3)):
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Your physical or electronic signature.</li>
            <li>
              Identification of the material that was removed and the location at which it
              appeared before removal.
            </li>
            <li>
              A statement, under penalty of perjury, that you have a good-faith belief the
              material was removed or disabled as a result of mistake or misidentification.
            </li>
            <li>
              Your name, address, and telephone number, plus a statement that you consent to
              the jurisdiction of the federal district court for the judicial district in which
              your address is located (or, if your address is outside the United States, for
              any judicial district in which we may be found), and that you will accept service
              of process from the person who submitted the original takedown notice (or that
              person&apos;s agent).
            </li>
          </ol>
          <p className="mt-3">
            Counter-notices should be sent to the designated agent address above. Once we
            receive a valid counter-notice, we will forward a copy to the original submitter.
            If they do not file a court action seeking a restraining order against the user
            within ten (10) business days, we may restore the removed material.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Repeat Infringer Policy</h2>
          <p>
            We will terminate, in appropriate circumstances, the accounts of users who are
            determined to be repeat infringers. We may also at our sole discretion limit access
            to the Service and/or terminate the accounts of any users who infringe any
            intellectual property rights, whether or not there is any repeated infringement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Misrepresentation</h2>
          <p>
            Under 17 U.S.C. &sect; 512(f), any person who knowingly materially misrepresents
            that material or activity is infringing — or that material or activity was removed
            or disabled by mistake or misidentification — may be liable for damages, including
            costs and attorneys&apos; fees, incurred by the alleged infringer, by any copyright
            owner or its authorized licensee, or by us. Please submit notices and counter-
            notices in good faith.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Not Legal Advice</h2>
          <p>
            This page summarizes the DMCA process for convenience. It is not legal advice. If
            you are unsure whether a notice or counter-notice is appropriate, consult a
            qualified attorney.
          </p>
        </section>

        <section className="text-xs italic">
          <p>
            See also our{" "}
            <Link href="/terms" className="text-[var(--ratist-red)] hover:underline">
              Terms of Service
            </Link>
            {" "}and{" "}
            <Link href="/privacy" className="text-[var(--ratist-red)] hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
