import type { Metadata } from "next";
export const metadata: Metadata = { title: "Personal Rankings" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
