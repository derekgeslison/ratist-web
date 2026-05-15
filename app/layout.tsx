import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { TypingGuardProvider } from "@/context/TypingGuardContext";
import Navbar from "@/components/Navbar";
import AccountStatusBanner from "@/components/AccountStatusBanner";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import OnboardingGuard from "@/components/OnboardingGuard";
import NavEntryAutoRegister from "@/components/NavEntryAutoRegister";
import TouchHint from "@/components/TouchHint";
import ConsentBanner from "@/components/ConsentBanner";
import CookiePreferencesLink from "@/components/CookiePreferencesLink";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import FirstLaunchPushPrompt from "@/components/FirstLaunchPushPrompt";
import NotificationDeepLink from "@/components/NotificationDeepLink";
import NativeAuthTokenSync from "@/components/NativeAuthTokenSync";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s — The Ratist",
    default: "The Ratist — Movie & TV Show Ratings, Community, & Tools",
  },
  description:
    "Discover movies and TV shows through deep, criteria-based ratings. Get personalized recommendations based on your unique taste profile.",
  metadataBase: new URL("https://www.theratist.com"),
  applicationName: "The Ratist",
  appleWebApp: {
    capable: true,
    title: "Ratist",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#cc1034",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
        {ADSENSE_ID && (
          <meta name="google-adsense-account" content={ADSENSE_ID} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* Google Consent Mode v2 — runs BEFORE GA4/AdSense scripts so
            their cookies are gated until the user grants consent. The
            inline script also restores any prior choice from localStorage
            so a returning user's earlier "Accept all" / "Reject all"
            applies on the very first GA4/AdSense call rather than after
            ConsentBanner finishes mounting. wait_for_update gives the
            banner up to 500ms to push an update; without it, the
            denied-default would lock cookies for the first impression. */}
        <Script id="consent-default" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
});
try {
  var raw = localStorage.getItem('ratist:consent-v1');
  if (raw) {
    var s = JSON.parse(raw);
    if (s && s.v === 1) {
      gtag('consent', 'update', {
        analytics_storage: s.analytics ? 'granted' : 'denied',
        ad_storage: s.advertising ? 'granted' : 'denied',
        ad_user_data: s.advertising ? 'granted' : 'denied',
        ad_personalization: s.advertising ? 'granted' : 'denied'
      });
    }
  }
} catch (e) { /* localStorage blocked — defaults stay denied */ }`}
        </Script>
        {ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {/* dataLayer + gtag are already initialized by the
                 consent-default script above; reusing them here keeps
                 a single dataLayer queue so the consent state and
                 GA4 init stay in sync. */}
              {`window.gtag('js', new Date());
window.gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "The Ratist",
            url: "https://www.theratist.com",
            potentialAction: {
              "@type": "SearchAction",
              target: { "@type": "EntryPoint", urlTemplate: "https://www.theratist.com/movies?search={search_term_string}" },
              "query-input": "required name=search_term_string",
            },
          }) }}
        />
        <TypingGuardProvider>
        <AuthProvider>
          <NavEntryAutoRegister />
          <AccountStatusBanner />
          <AnnouncementBanner />
          <Navbar />
          <OnboardingGuard>
            <main className="flex-1">{children}</main>
          </OnboardingGuard>
          <TouchHint />
          <ScrollToTopButton />
          <ConsentBanner />
          <ServiceWorkerRegister />
          <FirstLaunchPushPrompt />
          <Suspense fallback={null}>
            <NotificationDeepLink />
          </Suspense>
          <NativeAuthTokenSync />
          <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--foreground-muted)]">
            <p>© {new Date().getFullYear()} The Ratist. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3">
              <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</a>
              <CookiePreferencesLink />
              <a href="/about" className="hover:text-white transition-colors">About</a>
              <a href="/contact" className="hover:text-white transition-colors">Contact</a>
              <a href="/feedback" className="hover:text-white transition-colors">Submit Feedback</a>
              <a href="/dmca" className="hover:text-white transition-colors">DMCA</a>
              <a href="/welcome" className="hover:text-white transition-colors">Take the Tour</a>
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
              {/* TMDB attribution — required by their API Terms of Service */}
              <a
                href="https://www.themoviedb.org"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="This product uses the TMDB API"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg"
                  alt="TMDB"
                  width={40}
                  height={40}
                />
              </a>
              <span className="text-xs">
                Movie &amp; celebrity data provided by{" "}
                <a
                  href="https://www.themoviedb.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white transition-colors"
                >
                  The Movie Database (TMDB)
                </a>
                . The Ratist is not endorsed or certified by TMDB.
              </span>
            </div>
          </footer>
        </AuthProvider>
        </TypingGuardProvider>
      </body>
    </html>
  );
}
