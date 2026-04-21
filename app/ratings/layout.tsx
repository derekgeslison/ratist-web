import type { Metadata } from "next";
export const metadata: Metadata = { title: "My Ratings" , robots: { index: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
