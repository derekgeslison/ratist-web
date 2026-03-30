import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s — The Ratist",
    default: "The Ratist — Movie Reviews & Ratings",
  },
  description:
    "Discover movies through deep, criteria-based ratings. Get personalized recommendations based on your unique taste profile.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--foreground-muted)]">
            <p>© {new Date().getFullYear()} The Ratist. All rights reserved.</p>
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
      </body>
    </html>
  );
}
