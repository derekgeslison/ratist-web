import type { Metadata } from "next";

export const metadata: Metadata = { title: "Collections" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
