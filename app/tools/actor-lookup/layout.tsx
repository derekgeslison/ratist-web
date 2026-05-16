import type { Metadata } from "next";
export const metadata: Metadata = { title: "What Else Do I Know Them From?", alternates: { canonical: "/tools/actor-lookup" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
