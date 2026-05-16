import type { Metadata } from "next";

export const metadata: Metadata = { title: "Collections", alternates: { canonical: "/tools/collections" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
