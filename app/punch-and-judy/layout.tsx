import type { Metadata } from "next";

export const metadata: Metadata = { title: "Two Thumbs" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
