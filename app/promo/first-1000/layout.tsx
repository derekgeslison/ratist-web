import type { Metadata } from "next";

export const metadata: Metadata = { title: "First 1000 Promo" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
