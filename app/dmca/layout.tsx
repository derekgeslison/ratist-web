import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA Notices",
  description: "DMCA designated agent contact, takedown notice requirements, counter-notice procedures, and repeat infringer policy for The Ratist.",
  alternates: { canonical: "/dmca" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
