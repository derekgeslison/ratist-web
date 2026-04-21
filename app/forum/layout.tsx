import type { Metadata } from "next";
export const metadata: Metadata = { title: "Forum", alternates: { canonical: "/forum" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
