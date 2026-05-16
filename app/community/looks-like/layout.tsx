import type { Metadata } from "next";
export const metadata: Metadata = { title: "Looks Like", alternates: { canonical: "/community/looks-like" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
