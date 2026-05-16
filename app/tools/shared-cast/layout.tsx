import type { Metadata } from "next";
export const metadata: Metadata = { title: "Shared Cast & Crew", alternates: { canonical: "/tools/shared-cast" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
