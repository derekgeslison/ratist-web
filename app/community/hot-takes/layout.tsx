import type { Metadata } from "next";
export const metadata: Metadata = { title: "Hot Takes", alternates: { canonical: "/community/hot-takes" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
