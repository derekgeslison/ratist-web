import type { Metadata } from "next";

export const metadata: Metadata = { title: "What Should I Watch?", alternates: { canonical: "/tools/recommend" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
