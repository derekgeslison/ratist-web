import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Matchup", alternates: { canonical: "/tools/matchup" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
