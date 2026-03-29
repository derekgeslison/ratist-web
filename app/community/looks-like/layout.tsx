import type { Metadata } from "next";
export const metadata: Metadata = { title: "Looks Like" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
