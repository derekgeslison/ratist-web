import type { Metadata } from "next";

export const metadata: Metadata = { title: "For You" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
