import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rate Movie" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
