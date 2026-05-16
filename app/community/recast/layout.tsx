import type { Metadata } from "next";
export const metadata: Metadata = { title: "Recast", alternates: { canonical: "/community/recast" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
